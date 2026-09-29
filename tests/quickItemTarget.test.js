import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pickQuickItemOrder } from '../src/lib/cashierBills.js'
import { ordersReducer } from '../src/store/ordersReducer.js'

const item = { id: 'm1', menu_item_id: 'm1', status: 'served', name: 'Dish', price: 3000, quantity: 1 }
const staleShell = { id: 'stale', table_id: 't4', created_at: '2026-09-26T08:21:00Z', payment_status: 'unpaid', status: 'sent_to_kitchen', items: [] }
const current = { id: 'today', table_id: 't4', created_at: '2026-09-29T09:08:00Z', payment_status: 'unpaid', status: 'needs_bill', items: [item] }

test('a quick item goes to the bill being viewed, never to an old leftover shell', () => {
  const orders = [staleShell, current]
  assert.equal(pickQuickItemOrder(orders, { tableId: 't4' }).id, 'today')
  assert.equal(pickQuickItemOrder(orders, { tableId: 't4', orderId: 'today' }).id, 'today')
  assert.equal(pickQuickItemOrder(orders, { orderId: 'stale' }).id, 'stale')
})

test('quick-item target ignores paid and cancelled orders and other tables', () => {
  const paid = { ...current, id: 'paid', payment_status: 'paid' }
  const cancelled = { ...current, id: 'cancelled', status: 'cancelled' }
  const elsewhere = { ...current, id: 'elsewhere', table_id: 't5' }
  assert.equal(pickQuickItemOrder([paid, cancelled, elsewhere], { tableId: 't4' }), null)
  assert.equal(pickQuickItemOrder([staleShell], { tableId: 't4' }).id, 'stale')
  assert.equal(pickQuickItemOrder([current], {}), null)
})

test('the reducer, database writer and cashier card all use the same target', () => {
  const reducer = readFileSync(new URL('../src/store/ordersReducer.js', import.meta.url), 'utf8')
  const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')
  const tables = readFileSync(new URL('../src/pages/CashierTables.jsx', import.meta.url), 'utf8')
  assert.match(reducer, /pickQuickItemOrder\(state\.orders, \{ tableId, orderId \}\)/)
  assert.match(db, /pickQuickItemOrder\(orders \|\| \[\], \{ tableId, orderId \}\)/)
  assert.doesNotMatch(db, /const order = orders\?\.\[0\]/)
  assert.match(tables, /tableId: isOffPremiseOrderType\(orderType\) \? null : order\.table_id,\s*orderId: order\.id,/)
})

test('reducer adds a table quick item to the current bill, leaving the shell empty', () => {
  const next = ordersReducer(
    { orders: [staleShell, { ...current, items: [] }], tables: [], cart: [] },
    { type: 'ADD_QUICK_ITEM_TO_ORDER', _itemId: 'row1', payload: { tableId: 't4', item: { id: 'm2', name: 'Dishes', price: 3000 } } },
  )
  assert.equal(next.orders.find(order => order.id === 'stale').items.length, 0)
  assert.equal(next.orders.find(order => order.id === 'today').items.length, 1)
})
