import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { mergeCompletedOrders } from '../api/telegram/_lib/orderStatusMessages.js'

const sql = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ASIL = id(101)
const SHOHRUZ = id(102)

test('only the waiter who opened the table is credited for the table session', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles(id uuid primary key, full_name text, email text);
    create table orders(
      id text primary key, table_id text, table_name text, waiter_name text,
      opened_by uuid, opened_by_name text not null default '',
      completed_by uuid, completed_by_name text not null default '',
      order_type text default 'dine_in', payment_status text default 'unpaid',
      status text default 'sent_to_kitchen', subtotal integer default 0,
      service_fee integer default 0, total integer default 0,
      paid_at timestamptz, created_at timestamptz not null default now()
    );
    create table order_items(
      id uuid primary key default gen_random_uuid(), order_id text, status text default 'new',
      kitchen_round_id text, submitted_at timestamptz, created_at timestamptz default now()
    );
    create table order_kitchen_rounds(
      order_id text not null, kitchen_round_id text not null, item_ids uuid[] not null,
      table_id text, submitted_by uuid, submitted_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      primary key (order_id, kitchen_round_id)
    );
    insert into profiles values
      ('${ASIL}', 'Asil', 'asil@example.test'),
      ('${SHOHRUZ}', 'Shohruz Xamidov', 'shohruz@example.test');
  `)
  await db.exec(sql('215_table_session_opener.sql'))
  await db.exec(sql('215_table_session_opener.sql'))
  await db.exec(sql('217_table_session_same_day.sql'))
  await db.exec(sql('217_table_session_same_day.sql'))
  await db.exec(sql('213_kpi_order_opening_cutoff.sql'))
  await db.exec(`
    create trigger set_order_actor_tracking_fields before insert or update on orders
      for each row execute function set_order_actor_tracking_fields();
    create trigger order_items_record_kitchen_round_receipt after insert on order_items
      for each row execute function record_order_kitchen_round_receipt();
    create trigger order_items_preserve_kitchen_round_receipt before delete on order_items
      for each row execute function record_order_kitchen_round_receipt();
  `)

  const as = actor => db.query(`select set_config('test.uid', $1, false)`, [actor || ''])
  let clock = 0
  const submit = async (actor, orderId, tableId, { amount = 0, type = 'dine_in', item = 'new', name, at } = {}) => {
    await as(actor)
    const actorName = name || (actor === ASIL ? 'Asil' : 'Shohruz Xamidov')
    const createdAt = at || `2026-09-29T14:${String(10 + clock++).padStart(2, '0')}:00+05:00`
    await db.query(
      `insert into orders(id, table_id, waiter_name, opened_by, opened_by_name, order_type, subtotal, created_at)
       values($1,$2,$3,$4,$3,$5,$6,$7)`,
      [orderId, tableId, actorName, actor, type, amount, createdAt]
    )
    if (item) {
      await db.query(
        `insert into order_items(order_id, status, kitchen_round_id, submitted_at) values($1,$2,$3,$4)`,
        [orderId, item, `round-${orderId}`, createdAt]
      )
    }
    await as(null)
  }
  const row = async orderId => (await db.query('select * from orders where id=$1', [orderId])).rows[0]
  const pay = orderIds => db.query(
    `update orders set payment_status='paid', status='completed', paid_at='2026-09-29T15:30:00+05:00' where id = any($1)`,
    [orderIds]
  )
  const kpiBase = async opener => Number((await db.query(
    `select employee_kpi_sales_base('2026-09-29','employee_opened_orders',$1,'00:00') as base`, [opener]
  )).rows[0].base)

  await t.test('a second waiter on an open table inherits the table opener', async () => {
    await submit(ASIL, 'stol4-a', 't4', { amount: 99000 })
    await submit(SHOHRUZ, 'stol4-b', 't4', { amount: 42000 })
    const second = await row('stol4-b')
    assert.equal(second.opened_by, ASIL)
    assert.equal(second.opened_by_name, 'Asil')
    assert.equal(second.waiter_name, 'Asil')
  })

  await t.test('the kitchen round still records who actually sent it', async () => {
    const rounds = (await db.query('select order_id, submitted_by from order_kitchen_rounds order by order_id')).rows
    assert.deepEqual(rounds, [
      { order_id: 'stol4-a', submitted_by: ASIL },
      { order_id: 'stol4-b', submitted_by: SHOHRUZ },
    ])
  })

  await t.test('KPI and the paid-order message credit only the opener', async () => {
    await pay(['stol4-a', 'stol4-b'])
    assert.equal(await kpiBase(ASIL), 141000)
    assert.equal(await kpiBase(SHOHRUZ), 0)
    const paid = (await db.query(`select * from orders where table_id='t4' order by created_at`)).rows
    assert.equal(mergeCompletedOrders(paid).waiter_name, 'Asil')
    // Payment by a cashier never rewrites the opener.
    assert.ok(paid.every(order => order.opened_by === ASIL))
  })

  await t.test('after payment the next waiter opens a new session in their own name', async () => {
    await submit(SHOHRUZ, 'stol4-c', 't4', { amount: 10000 })
    const next = await row('stol4-c')
    assert.equal(next.opened_by, SHOHRUZ)
    assert.equal(next.waiter_name, 'Shohruz Xamidov')
  })

  await t.test('empty shells, cancelled orders and other tables do not pass on an opener', async () => {
    await submit(ASIL, 'shell', 't5', { item: null })
    await submit(ASIL, 'all-cancelled', 't5', { item: 'cancelled' })
    await submit(ASIL, 'cancelled-order', 't5')
    await db.query(`update orders set status='cancelled' where id='cancelled-order'`)
    await submit(SHOHRUZ, 'stol5', 't5')
    assert.equal((await row('stol5')).opened_by, SHOHRUZ)
    await submit(ASIL, 'stol6', 't6')
    assert.equal((await row('stol6')).opened_by, ASIL)
  })

  await t.test('off-premise orders keep their own creator', async () => {
    await submit(ASIL, 'stol7', 't7')
    await submit(SHOHRUZ, 'ta-1', null, { type: 'take_away' })
    await submit(SHOHRUZ, 'gc-1', 't7', { type: 'game_club' })
    assert.equal((await row('ta-1')).opened_by, SHOHRUZ)
    assert.equal((await row('gc-1')).opened_by, SHOHRUZ)
  })

  await t.test('an unattributed opener is never replaced by the second waiter', async () => {
    await submit(null, 'stol8-a', 't8', { name: 'Legacy waiter' })
    await submit(SHOHRUZ, 'stol8-b', 't8')
    const second = await row('stol8-b')
    assert.equal(second.opened_by, null)
    assert.equal(second.waiter_name, 'Legacy waiter')
  })

  await t.test('a forgotten order from an earlier day never passes its opener to a new party', async () => {
    await submit(ASIL, 'stale-t9', 't9', { at: '2026-09-26T13:21:00+05:00' })
    await submit(SHOHRUZ, 'today-t9', 't9')
    const today = await row('today-t9')
    assert.equal(today.opened_by, SHOHRUZ)
    assert.equal(today.waiter_name, 'Shohruz Xamidov')
  })
})
