import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAtomicPaymentPayload } from '../src/lib/db.js'

const dbSource = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')
const migration = readFileSync(
  new URL('../supabase/083_atomic_order_payment_settlement.sql', import.meta.url),
  'utf8'
)

function paymentCaseSource() {
  const start = dbSource.indexOf("case 'MARK_ORDER_PAID':")
  const end = dbSource.indexOf("case 'DELETE_ORDER':", start)
  return dbSource.slice(start, end)
}

function settlementFunctionSource() {
  const start = migration.indexOf('create or replace function public.settle_orders_payment(payload jsonb)')
  const end = migration.indexOf('\nend;\n$$;', start)
  return migration.slice(start, end + '\nend;\n$$;'.length)
}

test('atomic payment payload preserves exact split amounts and loyalty request', () => {
  const payload = buildAtomicPaymentPayload({
    type: 'MARK_ORDER_PAID',
    payload: {
      tableId: 'table-1',
      payments: [
        { method: 'cash', amount: 70_000 },
        { payment_method: 'terminal', amount: 30_000 },
      ],
      loyalty: {
        loyalty_card_number: '12345678',
        loyalty_used_amount: 25_000,
        // The browser's displayed total is deliberately not sent as authority.
        total: 100_000,
        cashback_percent: 99,
      },
    },
  })

  assert.deepEqual(payload, {
    order_id: null,
    table_id: 'table-1',
    payments: [
      { method: 'cash', amount: 70_000 },
      { method: 'terminal', amount: 30_000 },
    ],
    loyalty_card_number: '12345678',
    loyalty_used_amount: 25_000,
  })
  assert.equal(Object.hasOwn(payload, 'total'), false)
  assert.equal(Object.hasOwn(payload, 'cashback_percent'), false)
})

test('atomic payment payload requires one target and explicit payment amounts', () => {
  assert.throws(
    () => buildAtomicPaymentPayload({ payload: { payments: [] } }),
    /exactly one order or table/
  )
  assert.throws(
    () => buildAtomicPaymentPayload({ payload: { orderId: 'o1', tableId: 't1', payments: [] } }),
    /exactly one order or table/
  )
  assert.throws(
    () => buildAtomicPaymentPayload({ payload: { orderId: 'o1' } }),
    /must match the current bill exactly/
  )
})

test('MARK_ORDER_PAID is a thin single-RPC caller with no partial client writes', () => {
  const source = paymentCaseSource()

  assert.match(source, /buildAtomicPaymentPayload\(action\)/)
  assert.match(source, /supabase\.rpc\('settle_orders_payment', \{ payload \}\)/)
  assert.equal((source.match(/supabase\.rpc\(/g) || []).length, 1)
  assert.doesNotMatch(source, /\.from\(/)
  assert.doesNotMatch(source, /settle_loyalty_wallet_payment/)
  assert.doesNotMatch(source, /rollbackLoyalty/)
  assert.match(source, /if \(error\) throw error[\s\S]*notifyTelegramOrderStatus/)
})

test('settlement recomputes the locked fresh bill and rejects both underpayment and overpayment', () => {
  const fn = settlementFunctionSource()

  assert.match(fn, /for order_row in[\s\S]*for update/)
  assert.match(fn, /from public\.order_items oi[\s\S]*where oi\.order_id = order_row\.id/)
  assert.match(fn, /coalesce\(oi\.unit_price, oi\.price, 0\)::bigint \* greatest\(coalesce\(oi\.quantity, 1\), 1\)::bigint/)
  assert.match(fn, /coalesce\(oi\.status, ''\) <> 'cancelled'/)
  assert.match(fn, /service_fee_value := round\(menu_subtotal::numeric \* service_rate::numeric \/ 100\)::bigint/)
  assert.match(fn, /when coalesce\(order_row\.order_type, 'dine_in'\) in \('take_away', 'delivery'\) then 0/)
  assert.match(fn, /if payment_total <> total_due then/)
  assert.match(fn, /Payment amount mismatch: expected %, received %/)
  assert.doesNotMatch(fn, /least\(payment_total, total_due\)/)
})

test('multiple order rounds and split payments are allocated without duplicating revenue', () => {
  const fn = settlementFunctionSource()

  assert.match(fn, /target_order_id is null and o\.table_id = target_table_id/)
  assert.match(fn, /summaries := summaries \|\| jsonb_build_array/)
  assert.match(fn, /sum\(amount\) over \(order by ordinality\) - amount as range_start/)
  assert.match(fn, /cross join payment_ranges payments/)
  assert.match(fn, /least\(orders\.range_end, payments\.range_end\) > greatest\(orders\.range_start, payments\.range_start\)/)
  assert.match(fn, /insert into public\.order_payments \(order_id, method, amount, created_by, created_at\)/)
})

test('loyalty settlement locks the card and derives cashback from its database type', () => {
  const fn = settlementFunctionSource()

  assert.match(fn, /from public\.loyalty_cards c[\s\S]*for update/)
  assert.match(fn, /requested_redeem > coalesce\(card_row\.balance, 0\)/)
  assert.match(fn, /card_type := lower\(coalesce\(card_row\.cashback_type, 'bronze'\)\)/)
  assert.match(fn, /when 'bronze' then 3/)
  assert.match(fn, /when 'platinum' then 30/)
  assert.match(fn, /when 'special' then 40/)
  assert.match(fn, /'redeemed', -loyalty_for_order::integer/)
  assert.match(fn, /'cashback_earned', cashback_for_order::integer/)
  assert.match(fn, /update public\.loyalty_cards/)
})

test('order, split payment, loyalty, and table writes share one rollback boundary', () => {
  const fn = settlementFunctionSource()

  assert.match(fn, /security definer/)
  assert.match(fn, /public\.current_staff_can_write\('cashier'\)/)
  assert.match(fn, /delete from public\.order_payments/)
  assert.match(fn, /update public\.orders/)
  assert.match(fn, /insert into public\.order_payments/)
  assert.match(fn, /insert into public\.loyalty_transactions/)
  assert.match(fn, /update public\.loyalty_cards/)
  assert.match(fn, /update public\.restaurant_tables/)
  assert.doesNotMatch(fn, /\bcommit\b|\brollback\b|exception\s+when/i)
})

test('settlement serializes fresh-total races and keeps tables occupied for remaining rounds', () => {
  const fn = settlementFunctionSource()

  assert.match(migration, /create trigger serialize_new_order_for_payment[\s\S]*before insert on public\.orders/)
  assert.match(migration, /create or replace function public\.guard_paid_order_items\(\)[\s\S]*pg_advisory_xact_lock[\s\S]*for update/)
  assert.match(fn, /pg_advisory_xact_lock/)
  assert.match(fn, /for affected_table_id in/)
  assert.match(fn, /if not exists \([\s\S]*remaining\.table_id = affected_table_id[\s\S]*coalesce\(remaining\.payment_status, 'unpaid'\) <> 'paid'/)
  assert.match(fn, /update public\.restaurant_tables[\s\S]*status = 'available'/)
})
