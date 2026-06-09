import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCashierBillableItems,
  isCashierVisibleBill,
  isTakeAwayBill,
} from '../src/lib/cashierBills.js'

const item = (overrides = {}) => ({
  id: overrides.id || 'i1',
  menu_item_id: overrides.menu_item_id || 'm1',
  name: overrides.name || 'Shashlik',
  quantity: overrides.quantity ?? 1,
  price: overrides.price ?? 25000,
  status: overrides.status || 'new',
  ...overrides,
})

const order = (overrides = {}) => ({
  id: overrides.id || 'o1',
  order_type: overrides.order_type || 'take_away',
  order_number: overrides.order_number || 'TA-6157',
  table_id: overrides.table_id ?? null,
  table_name: overrides.table_name || 'Take Away',
  status: overrides.status || 'sent_to_kitchen',
  payment_status: overrides.payment_status || 'unpaid',
  service_rate_pct: overrides.service_rate_pct ?? 0,
  subtotal: overrides.subtotal ?? 0,
  total: overrides.total ?? 0,
  items: overrides.items ?? [],
  created_at: overrides.created_at || new Date().toISOString(),
})

test('cashier hides empty zero-total take-away shells', () => {
  assert.equal(isTakeAwayBill(order()), true)
  assert.equal(isCashierVisibleBill(order({ items: [], total: 0 })), false)
})

test('cashier hides empty active orders even when stale stored totals exist', () => {
  assert.equal(isCashierVisibleBill(order({ items: [], subtotal: 62000, total: 62000 })), false)
})

test('cashier hides orders where every item was cancelled', () => {
  const emptyBill = order({
    items: [
      item({ id: 'i1', status: 'cancelled', price: 18000 }),
      item({ id: 'i2', status: 'cancelled', price: 22000 }),
    ],
    subtotal: 40000,
    total: 40000,
  })

  assert.deepEqual(getCashierBillableItems(emptyBill), [])
  assert.equal(isCashierVisibleBill(emptyBill), false)
})

test('cashier shows valid unpaid take-away orders immediately', () => {
  assert.equal(isCashierVisibleBill(order({ items: [item({ price: 18000 })] })), true)
})

test('cashier hides paid or cancelled orders even with billable items', () => {
  assert.equal(isCashierVisibleBill(order({ payment_status: 'paid', items: [item()] })), false)
  assert.equal(isCashierVisibleBill(order({ status: 'cancelled', items: [item()] })), false)
})
