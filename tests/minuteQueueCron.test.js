import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../supabase/218_single_minute_queue_cron.sql', import.meta.url), 'utf8')

async function setup(t, { failing } = {}) {
  const db = new PGlite(); t.after(() => db.close())
  const invokers = [
    'invoke_game_club_team_notifications',
    'invoke_order_status_cleanup',
    'invoke_ingredient_investor_notifications',
    'invoke_employee_order_kpi_notifications',
  ]
  await db.exec(`
    create role anon; create role authenticated; create schema cron;
    create table cron.job(jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as
      $$ insert into cron.job(jobname, schedule, command) values ($1, $2, $3) returning jobid $$;
    create function cron.unschedule(bigint) returns boolean language sql as
      $$ delete from cron.job where jobid = $1 returning true $$;
    create table calls(name text);
    ${invokers.map(name => `create function public.${name}() returns bigint language plpgsql as $$
      begin
        insert into calls values ('${name}');
        ${name === failing ? `raise exception 'boom';` : ''}
        return 1;
      end $$;`).join('\n')}
    insert into cron.job(jobname, schedule, command) values
      ('zar-kebab-game-club-team', '* * * * *', 'a'),
      ('zar-kebab-order-status-cleanup', '* * * * *', 'b'),
      ('zar-kebab-ingredient-investor', '* * * * *', 'c'),
      ('zar-kebab-employee-order-kpi', '* * * * *', 'd'),
      ('zar-kebab-daily-reports', '0 20 * * *', 'e');
  `)
  await db.exec(migration)
  return { db, invokers }
}

test('four minute queue jobs become one dispatcher job and daily jobs stay', async t => {
  const { db } = await setup(t)
  await db.exec(migration) // reapplying stays idempotent
  const jobs = (await db.query('select jobname, schedule, command from cron.job order by jobname')).rows
  assert.deepEqual(jobs, [
    { jobname: 'zar-kebab-daily-reports', schedule: '0 20 * * *', command: 'e' },
    { jobname: 'zar-kebab-minute-queues', schedule: '* * * * *', command: 'select public.invoke_minute_telegram_queues();' },
  ])
})

test('dispatcher runs every queue even when one fails', async t => {
  const { db, invokers } = await setup(t, { failing: 'invoke_order_status_cleanup' })
  await db.query('select public.invoke_minute_telegram_queues()')
  const calls = (await db.query('select name from calls')).rows.map(row => row.name)
  // The failing invoker's own insert rolls back with its subtransaction.
  assert.deepEqual(calls, invokers.filter(name => name !== 'invoke_order_status_cleanup'))
})

test('dispatcher is private to the service', () => {
  assert.match(migration, /security definer/)
  assert.match(migration, /revoke all on function public\.invoke_minute_telegram_queues\(\) from public, anon, authenticated/)
})
