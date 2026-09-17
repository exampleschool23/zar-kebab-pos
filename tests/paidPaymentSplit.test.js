import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { getPaymentSplitAmounts, applyPaymentSplit } from '../src/lib/paidPaymentSplit.js'
import { getOrderPaymentBreakdown, groupOrdersBySession } from '../src/lib/analytics.js'

const sql = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('split validation preserves integer totals and rejects empty, zero, overpaid and fractional inputs', () => {
  assert.deepEqual(getPaymentSplitAmounts(172500, '100000'), { valid: true, firstAmount: 100000, secondAmount: 72500 })
  for (const amount of ['', ' ', '0', '-1', '172500', '172501', '1.5', '1e3', 'NaN']) {
    assert.equal(getPaymentSplitAmounts(172500, amount).valid, false, amount)
  }
  assert.equal(getPaymentSplitAmounts(2, '1').secondAmount, 1)
})

test('confirmed split updates the correct merged order and report payment totals', () => {
  const originals = ['one', 'two'].map((key, i) => ({
    id: key, table_id: 't', paid_at: '2026-09-17T12:00:00Z', payment_status: 'paid',
    total: 100, payments: [{ id: id(i), order_id: key, method: 'cash', amount: 100 }],
  }))
  const result = { orderId: 'two', payment_method: 'mixed', payments: [
    { id: id(1), order_id: 'two', method: 'cash', amount: 40 },
    { id: id(2), order_id: 'two', method: 'terminal', amount: 60 },
  ] }
  assert.equal(applyPaymentSplit(originals[0], result), originals[0])
  const [merged] = groupOrdersBySession(originals)
  const updated = applyPaymentSplit(merged, result)
  assert.equal(updated.total, 200)
  assert.equal(updated.payments.length, 3)
  assert.deepEqual(getOrderPaymentBreakdown(updated).map(({ method, amount }) => ({ method, amount })), [
    { method: 'cash', amount: 140 }, { method: 'terminal', amount: 60 },
  ])
})

test('paid-payment split executes atomically with guards, audit, authorization and retry receipts', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${id(99)}');
    create function auth.uid() returns uuid language sql as $$ select '${id(99)}'::uuid $$;
    create function current_staff_can_access(text) returns boolean language sql as $$ select true $$;
    create function current_staff_has_role(text[]) returns boolean language sql as $$ select true $$;
    create table profiles(id uuid primary key, full_name text, email text, role text);
    insert into profiles values('${id(99)}', 'Editor', 'editor@example.test', 'owner');
    create table orders(id text primary key, table_id text, table_name text, order_number text,
      total integer, subtotal integer, service_fee integer default 0, service_rate_pct integer default 0,
      loyalty_discount_pct integer default 0, loyalty_discount_amount integer default 0,
      payment_status text default 'paid', status text default 'completed', payment_method text default 'cash',
      updated_at timestamptz, paid_at timestamptz default '2026-09-17T12:00:00Z');
  `)
  const auditSql = sql('010_order_payment_audit_and_guards.sql')
  await db.exec(auditSql.slice(auditSql.indexOf('create table if not exists public.order_payment_audit'), auditSql.indexOf('create index if not exists idx_order_payment_audit')))
  await db.exec(sql('012_split_order_payments.sql'))
  await db.exec(sql('090_owner_change_completed_order_payment_method.sql'))
  await db.exec(sql('117_owner_change_individual_payment_methods.sql'))
  await db.exec(sql('173_paid_order_edit_feature_access.sql'))
  await db.exec(`create trigger guard_and_audit_order_payment before update on orders for each row execute function guard_and_audit_order_payment();`)
  await db.exec(sql('175_order_change_investor_notifications.sql'))
  await db.exec(sql('176_repair_order_change_investor_trigger.sql'))
  await db.exec(sql('201_split_completed_order_payment.sql'))
  const seed = async (key, paymentId, method = 'cash') => {
    await db.query('insert into orders(id, total, subtotal) values($1,172500,150000)', [key])
    if (paymentId) await db.query(`insert into order_payments(id,order_id,method,amount,created_by,created_at)
      values($1,$2,$3,172500,$4,'2026-09-17T12:00:00Z')`, [paymentId, key, method, id(99)])
  }
  const split = async (request, order, payment, overrides = {}) => {
    const params = { amount: 172500, method: 'cash', first: 100000, firstMethod: 'cash', secondMethod: 'terminal', ...overrides }
    return (await db.query('select split_paid_order_payment($1,$2,$3,$4,$5,$6,$7,$8) as result',
      [request, order, payment, params.amount, params.method, params.first, params.firstMethod, params.secondMethod])).rows[0].result
  }
  await seed('one', id(1))
  const before = (await db.query("select * from orders where id='one'")).rows[0]
  const result = await split(id(10), 'one', id(1))
  assert.deepEqual(result.payments.map(p => [p.method, p.amount]).sort(), [['cash', 100000], ['terminal', 72500]])
  assert.equal(result.payment_method, 'mixed')
  const after = (await db.query("select * from orders where id='one'")).rows[0]
  assert.deepEqual({ ...after, payment_method: before.payment_method, updated_at: before.updated_at }, before)
  assert.equal(result.payments[0].created_at, result.payments[1].created_at)
  assert.deepEqual(await split(id(10), 'one', id(1)), result, 'lost-response retry returns the durable outcome')
  assert.equal((await db.query('select count(*)::int as n from paid_payment_split_receipts')).rows[0].n, 1)
  const notices = (await db.query('select * from order_change_investor_notification_deliveries')).rows
  assert.equal(notices.length, 1)
  assert.equal(notices[0].old_payment_methods.length, 1)
  assert.equal(notices[0].new_payment_methods.length, 2)
  await assert.rejects(split(id(10), 'one', id(1), { first: 50000 }), /Request id already used/)
  await assert.rejects(split(id(11), 'one', id(1)), /Payment changed/)

  await seed('loyalty', id(2), 'loyalty_card')
  await assert.rejects(split(id(12), 'loyalty', id(2), { method: 'loyalty_card' }), /cannot be split/)
  await seed('invalid', id(3))
  for (const first of [0, -1, 172500, 180000, null]) {
    await assert.rejects(split(id(13), 'invalid', id(3), { first }), /Two positive payments/)
  }
  await assert.rejects(split(id(13), 'invalid', id(3), { secondMethod: 'loyalty_card' }), /supported methods/)
  await assert.rejects(split(id(13), 'invalid', id(2)), /Payment changed/)
  await db.exec("update orders set payment_status='unpaid',status='new',paid_at=null where id='invalid'").then(
    () => assert.fail('paid order should stay locked'), error => assert.match(error.message, /cannot be reopened/))
  await db.exec("insert into orders(id,total,subtotal,payment_status,status,paid_at) values('unpaid',100,100,'unpaid','new',null)")
  await assert.rejects(split(id(14), 'unpaid', null, { amount: 100, first: 50 }), /not completed/)
  await seed('legacy', null)
  const legacy = await split(id(15), 'legacy', null)
  assert.equal(legacy.payments.length, 2)
  assert.deepEqual(await split(id(15), 'legacy', null), legacy)
  await assert.rejects(split(id(16), 'legacy', null), /Payment changed/)

  await seed('with-loyalty', id(4))
  await db.query("insert into order_payments(id,order_id,method,amount) values($1,'with-loyalty','loyalty_card',5000)", [id(5)])
  const walletBefore = (await db.query('select * from order_payments where id=$1', [id(5)])).rows[0]
  await split(id(17), 'with-loyalty', id(4), { firstMethod: 'terminal' })
  assert.deepEqual((await db.query('select * from order_payments where id=$1', [id(5)])).rows[0], walletBefore)
  const notice = (await db.query("select * from order_change_investor_notification_deliveries where order_id='with-loyalty'")).rows
  assert.equal(notice.length, 1, 'method trigger and split share one full notification')
  assert.equal(notice[0].old_payment_methods.length, 2)
  assert.equal(notice[0].new_payment_methods.length, 3)

  await db.exec('create or replace function current_staff_can_access(text) returns boolean language sql as $$ select false $$;')
  await assert.rejects(split(id(18), 'invalid', id(3)), /access is required/)
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from paid_payment_split_receipts'), /permission denied/)
})
