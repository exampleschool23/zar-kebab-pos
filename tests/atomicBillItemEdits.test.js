import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { getActiveTableOrders } from '../src/lib/tableGuestEntry.js'
import { getOrderPaymentFields } from '../src/lib/analytics.js'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('empty and cancelled-item shells cannot keep waiter tables occupied using stale totals', () => {
  const base = { table_id: 't4', status: 'needs_bill', payment_status: 'unpaid', subtotal: 36000, total: 41400 }
  assert.deepEqual(getActiveTableOrders('t4', [
    { ...base, id: 'empty', items: [] },
    { ...base, id: 'cancelled', items: [{ price: 36000, quantity: 1, status: 'cancelled' }] },
  ]), [])
  const page = read('src/pages/WaiterTables.jsx')
  assert.match(page, /function getVisibleActiveOrdersForTable\(tableId, orders\) \{\s*return getActiveTableOrders\(tableId, orders\)/)
})

test('bill edits use the atomic RPC exclusively and keep a stable retry identity', () => {
  const source = read('src/lib/db.js')
  const body = source.slice(source.indexOf("case 'UPDATE_BILL_ITEM_QTY':"), source.indexOf("case 'MARK_ORDER_PAID':"))
  assert.match(body, /rpc\('update_bill_item_quantity'/)
  assert.doesNotMatch(body, /\.from\(|getOrderPaymentFields/)
  assert.match(read('src/store/AppContext.jsx'), /_billEditRequestId: action\._billEditRequestId \|\| makeLocalId\(\)/)
})

test('atomic bill edits recalculate durable items, roll back failures, protect paid history, and reconcile retries', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${uuid(99)}'::uuid $$;
    create table permissions(feature text primary key, allowed boolean);
    insert into permissions values ('cashier',true),('tables',true);
    create function current_staff_can_write(text) returns boolean language sql as $$ select allowed from permissions where feature=$1 $$;
    create table restaurant_tables(id text primary key, status text, updated_at timestamptz);
    create table orders(id text primary key, table_id text, payment_status text, status text,
      paid_at timestamptz, order_type text default 'dine_in', subtotal integer default 0,
      service_rate_pct numeric default 15, service_fee integer default 0, total integer default 0 check(total >= 0), updated_at timestamptz);
    create table order_items(id uuid primary key, order_id text references orders(id), sale_unit text default 'piece',
      price integer, unit_price integer, quantity numeric, status text default 'new',
      is_counter_item boolean default false, item_type text default 'menu');
    insert into restaurant_tables values ('t4','needs_bill',now());
  `)
  // Include the actual item/checkout serialization guard used by production.
  const settlement = read('supabase/083_atomic_order_payment_settlement.sql')
  await db.exec(settlement.slice(0, settlement.indexOf('create or replace function public.settle_orders_payment')))
  const migration = read('supabase/212_atomic_bill_item_edits.sql')
  await db.exec(migration)
  const seed = async (order, item, overrides = '') => {
    await db.query("insert into orders(id,table_id,payment_status,status) values ($1,'t4','unpaid','sent_to_kitchen')", [order])
    await db.query('insert into order_items(id,order_id,price,quantity) values($1,$2,36000,1)', [uuid(item), order])
    if (overrides) await db.exec(overrides)
  }
  const payload = (request, order, item, qty, source = []) => ({
    request_id: uuid(request), order_id: order, table_id: 't4', order_item_id: uuid(item),
    source_item_ids: source.map(uuid), quantity: qty,
  })
  const edit = async p => (await db.query('select update_bill_item_quantity($1::jsonb) as result', [JSON.stringify(p)])).rows[0].result
  const order = async id => (await db.query('select * from orders where id=$1', [id])).rows[0]

  await seed('race', 1)
  await db.query('insert into order_items(id,order_id,price,quantity) values($1,$2,12000,1)', [uuid(2), 'race'])
  // Requests originate from the same pre-edit bill. No client subtotal is accepted.
  const requests = [payload(101, 'race', 1, 0), payload(102, 'race', 2, 0)]
  await Promise.all(requests.map(edit))
  assert.equal((await order('race')).total, 0)
  assert.equal((await order('race')).subtotal, 0)
  assert.equal((await order('race')).service_fee, 0)
  assert.equal((await db.query("select status from restaurant_tables where id='t4'")).rows[0].status, 'available')
  assert.equal((await db.query("select count(*)::int as n from order_items where order_id='race'")).rows[0].n, 0)
  assert.deepEqual(await edit(requests[1]), { order_id: 'race', total: 0 })
  assert.equal((await db.query('select count(*)::int as n from bill_item_edit_receipts')).rows[0].n, 2)
  await assert.rejects(edit({ ...requests[1], quantity: 3 }), /Request id already used/)

  await seed('weighted', 3, "update order_items set sale_unit='kg', price=50000, quantity=0.5 where order_id='weighted'")
  await db.query("insert into order_items(id,order_id,price,quantity,is_counter_item) values($1,'weighted',7000,1,true)", [uuid(4)])
  await edit(payload(103, 'weighted', 3, 0.255))
  let saved = await order('weighted')
  const expected = getOrderPaymentFields({service_rate_pct: 15}, [
    { price: 50000, quantity: 0.255 }, {price: 7000, quantity: 1, is_counter_item: true},
  ])
  for (const field of ['subtotal','service_fee','total']) assert.equal(saved[field], Math.round(expected[field]))
  await db.exec("update orders set order_type='game_club' where id='weighted'")
  await edit(payload(104, 'weighted', 3, 0.3))
  assert.equal((await order('weighted')).service_fee, 0)

  // A failed totals write rolls back the item edit and its receipt as well.
  await db.exec("alter table orders add constraint forced_failure check (id <> 'weighted' or total < 100000)")
  await assert.rejects(edit(payload(105, 'weighted', 3, 10)), /forced_failure/)
  assert.equal(Number((await db.query('select quantity from order_items where id=$1', [uuid(3)])).rows[0].quantity), 0.3)
  assert.equal((await db.query('select count(*)::int as n from bill_item_edit_receipts where request_id=$1', [uuid(105)])).rows[0].n, 0)

  await seed('paid', 5)
  await db.exec("update orders set payment_status='paid', status='paid', paid_at=now(), total=41400 where id='paid'")
  saved = await order('paid')
  await assert.rejects(edit(payload(106, 'paid', 5, 0)), /closed/)
  assert.deepEqual(await order('paid'), saved)
  // A replay succeeds even after later payment, without overwriting that payment.
  await db.exec("update orders set payment_status='paid', paid_at=now() where id='weighted'")
  assert.deepEqual(await edit(payload(104, 'weighted', 3, 0.3)), {order_id: 'weighted', total: 22000})

  await seed('group', 6)
  await db.query("insert into order_items(id,order_id,price,quantity) values($1,'group',36000,1)", [uuid(7)])
  await edit(payload(107, 'group', 6, 3, [6,7]))
  assert.equal((await order('group')).total, 124200)
  assert.equal((await db.query("select count(*)::int as n from order_items where order_id='group'")).rows[0].n, 1)
  await assert.rejects(edit(payload(108, 'group', 6, 0, [5])), /different orders/)
  await assert.rejects(edit({ ...payload(109, 'group', 6, 0), table_id: 'other' }), /unavailable/)
  await assert.rejects(edit(payload(110, 'group', 6, -1)), /Invalid/)

  await db.exec("update orders set status='needs_bill' where id='group'; update permissions set allowed=false where feature='cashier'")
  await assert.rejects(edit(payload(111, 'group', 6, 0)), /cashier/)
  await db.exec("update orders set status='sent_to_kitchen' where id='group'")
  await edit(payload(112, 'group', 6, 2)) // waiter may edit a recalled bill
  await seed('other-active', 8)
  await db.exec("update restaurant_tables set status='needs_bill' where id='t4'; update orders set payment_status=null where id='group'")
  await edit(payload(114, 'group', 6, 0))
  assert.equal((await order('group')).total, 0, 'legacy null payment status remains editable')
  assert.equal((await db.query("select status from restaurant_tables where id='t4'")).rows[0].status, 'needs_bill', 'another active order keeps its table status')
  await db.exec("update orders set status='cancelled' where id='other-active'")
  await assert.rejects(edit(payload(115, 'other-active', 8, 0)), /closed/)
  await db.exec('update permissions set allowed=false')
  await assert.rejects(edit(payload(113, 'group', 6, 0)), /permission/)

  // Guard lock acquisition must precede mutation and total reads.
  assert.ok(migration.indexOf("'pos-table:'") < migration.indexOf('delete from public.order_items'))
  assert.ok(migration.indexOf('for update;') < migration.indexOf('delete from public.order_items'))
})
