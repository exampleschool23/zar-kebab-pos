import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')

const INVOKERS = {
  invoke_game_club_team_notifications: 'game-club-orders',
  invoke_order_status_cleanup: 'order-status-cleanup',
  invoke_ingredient_investor_notifications: 'ingredient-events',
  invoke_employee_order_kpi_notifications: 'employee-order-kpi',
}

async function setup(t, { failing } = {}) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create schema cron;
    create table cron.job(jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as
      $$ insert into cron.job(jobname, schedule, command) values ($1, $2, $3) returning jobid $$;
    create function cron.unschedule(bigint) returns boolean language sql as
      $$ delete from cron.job where jobid = $1 returning true $$;
    create table calls(task text);
    ${Object.entries(INVOKERS).map(([name, task]) => `create function public.${name}() returns bigint language plpgsql as $$
      begin
        insert into calls values ('${task}');
        ${name === failing ? `raise exception 'boom';` : ''}
        return 1;
      end $$;`).join('\n')}
    create table game_club_team_notifications(id serial primary key, status text not null default 'queued');
    create table ingredient_investor_notifications(id serial primary key, status text not null default 'queued');
    create table order_status_telegram_messages(id serial primary key, message_id text,
      delete_requested boolean not null default false, deleted_at timestamptz, attempted_at timestamptz);
    create table employee_order_kpi_notifications(id serial primary key, status text not null default 'queued',
      delete_requested boolean not null default false, deleted_at timestamptz,
      telegram_message_id bigint, cleanup_attempted_at timestamptz);
    insert into cron.job(jobname, schedule, command) values
      ('zar-kebab-game-club-team', '* * * * *', 'a'),
      ('zar-kebab-daily-reports', '0 20 * * *', 'e');
  `)
  await db.exec(sql('218_single_minute_queue_cron.sql'))
  await db.exec(sql('219_event_driven_telegram_queues.sql'))
  return db
}

const calls = async db => (await db.query('select task from calls')).rows.map(row => row.task)
const reset = db => db.exec('delete from calls')

test('minute cron becomes a 15-minute sweep and daily jobs stay', async t => {
  const db = await setup(t)
  await db.exec(sql('219_event_driven_telegram_queues.sql')) // reapplying stays idempotent
  const jobs = (await db.query('select jobname, schedule, command from cron.job order by jobname')).rows
  assert.deepEqual(jobs, [
    { jobname: 'zar-kebab-daily-reports', schedule: '0 20 * * *', command: 'e' },
    { jobname: 'zar-kebab-queue-sweep', schedule: '*/15 * * * *', command: 'select public.invoke_telegram_queues();' },
  ])
  const oldDispatcher = await db.query("select to_regprocedure('public.invoke_minute_telegram_queues()') as fn")
  assert.equal(oldDispatcher.rows[0].fn, null)
  await db.query('select public.invoke_telegram_queues()')
  assert.deepEqual((await calls(db)).sort(), Object.values(INVOKERS).sort())
})

test('new queued rows wake their sender once per transaction', async t => {
  const db = await setup(t)
  await db.exec(`begin;
    insert into game_club_team_notifications default values;
    insert into game_club_team_notifications default values;
    insert into ingredient_investor_notifications default values;
    commit;`)
  assert.deepEqual(await calls(db), ['game-club-orders', 'ingredient-events'])
  await reset(db)
  await db.exec('insert into game_club_team_notifications default values')
  assert.deepEqual(await calls(db), ['game-club-orders'])
})

test("senders' own claim and receipt updates never re-trigger a send", async t => {
  const db = await setup(t)
  await db.exec(`
    insert into game_club_team_notifications default values;
    insert into employee_order_kpi_notifications default values;
    insert into order_status_telegram_messages(message_id) values ('m1');`)
  await reset(db)
  await db.exec(`
    update game_club_team_notifications set status = 'processing';
    update game_club_team_notifications set status = 'sent';
    update employee_order_kpi_notifications set status = 'sent', telegram_message_id = 5;
    update order_status_telegram_messages set attempted_at = now();`)
  assert.deepEqual(await calls(db), [])
})

test('deleted orders wake retraction only when a sent message must be removed', async t => {
  const db = await setup(t)
  await db.exec(`
    insert into order_status_telegram_messages(message_id) values ('m1');
    insert into employee_order_kpi_notifications(status, telegram_message_id) values ('sent', 5);
    insert into employee_order_kpi_notifications(status) values ('processing');`)
  await reset(db)

  await db.exec('update order_status_telegram_messages set delete_requested = true')
  await db.exec('update employee_order_kpi_notifications set delete_requested = true')
  assert.deepEqual(await calls(db), ['order-status-cleanup', 'employee-order-kpi'])

  await reset(db)
  // Retry bookkeeping on an already requested cleanup waits for the sweep.
  await db.exec(`
    update order_status_telegram_messages set attempted_at = now();
    update employee_order_kpi_notifications set cleanup_attempted_at = now() where telegram_message_id is not null;`)
  assert.deepEqual(await calls(db), [])

  // A late receipt for a deleted order's in-flight send still gets retracted.
  await db.exec('update employee_order_kpi_notifications set telegram_message_id = 6 where telegram_message_id is null')
  assert.deepEqual(await calls(db), ['employee-order-kpi'])

  await reset(db)
  await db.exec("insert into order_status_telegram_messages(message_id, delete_requested) values ('m2', true)")
  await db.exec("insert into order_status_telegram_messages(message_id, delete_requested) values (null, true)")
  assert.deepEqual(await calls(db), ['order-status-cleanup'])
})

test('a failing kick never blocks the write that queued the work', async t => {
  const db = await setup(t, { failing: 'invoke_game_club_team_notifications' })
  await db.exec('insert into game_club_team_notifications default values')
  const saved = await db.query('select count(*)::int as n from game_club_team_notifications')
  assert.equal(saved.rows[0].n, 1)
})

test('kick helpers stay private to the database', () => {
  const migration = sql('219_event_driven_telegram_queues.sql')
  for (const fn of ['invoke_telegram_queues()', 'kick_telegram_queue(text)', 'kick_game_club_team_queue()',
    'kick_ingredient_investor_queue()', 'kick_order_status_cleanup_insert()', 'kick_order_status_cleanup_update()',
    'kick_employee_order_kpi_insert()', 'kick_employee_order_kpi_update()']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, '\\$&')} from public, anon, authenticated`))
  }
})
