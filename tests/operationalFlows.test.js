import test from 'node:test'
import assert from 'node:assert/strict'
import { ordersReducer } from '../src/store/ordersReducer.js'
import { tablesReducer } from '../src/store/tablesReducer.js'
import { clearReservationPatch } from '../src/lib/tableActivity.js'

const state = () => ({
  settings: { serviceRate: 15 },
  user: { name: 'Jasurbek' },
  currentTableId: 't1',
  tables: [{ id: 't1', name: 'Table 1', status: 'available', is_active: true, capacity: 4, sort_order: 1 }],
  orders: [],
  cart: [{ id: 'cart-1', menu_item_id: 'm1', name: 'Shashlik', price: 100000, quantity: 2 }],
})

test('end-to-end floor flow: waiter sends, kitchen marks ready, waiter requests bill, cashier pays', () => {
  const sent = ordersReducer(state(), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'o1',
    _items: [{ id: 'i1', menu_item_id: 'm1', name: 'Shashlik', price: 100000, quantity: 2, status: 'new' }],
    payload: { orderType: 'dine_in' },
  })

  assert.equal(sent.orders.length, 1)
  assert.equal(sent.orders[0].status, 'sent_to_kitchen')
  assert.equal(sent.orders[0].service_rate_pct, 15)
  assert.equal(sent.tables[0].status, 'occupied')
  assert.equal(sent.cart.length, 0)

  const ready = ordersReducer(sent, {
    type: 'UPDATE_ORDER_ITEM_STATUS',
    payload: { orderId: 'o1', orderItemId: 'i1', status: 'ready' },
  })
  assert.equal(ready.orders[0].items[0].status, 'ready')

  const delivered = ordersReducer(ready, { type: 'CONFIRM_ORDER_DELIVERED', payload: 't1' })
  assert.equal(delivered.orders[0].status, 'delivered')
  assert.equal(delivered.orders[0].items[0].status, 'served')

  const needsBill = ordersReducer(delivered, { type: 'MARK_TABLE_NEEDS_BILL', payload: 't1' })
  assert.equal(needsBill.tables[0].status, 'needs_bill')
  assert.equal(needsBill.orders[0].status, 'needs_bill')

  const paid = ordersReducer(needsBill, {
    type: 'MARK_ORDER_PAID',
    payload: { tableId: 't1', payment_method: 'cash' },
  })
  assert.equal(paid.tables[0].status, 'available')
  assert.equal(paid.orders[0].payment_status, 'paid')
  assert.equal(paid.orders[0].payment_method, 'cash')
})

test('kitchen can cancel one unavailable item without cancelling the rest of the order', () => {
  const sent = ordersReducer(state(), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'o1',
    _items: [
      { id: 'i1', menu_item_id: 'm1', name: 'Shashlik', price: 100000, quantity: 1, status: 'new' },
      { id: 'i2', menu_item_id: 'm2', name: 'Lagman', price: 50000, quantity: 1, status: 'new' },
    ],
    payload: { orderType: 'dine_in' },
  })

  const cancelled = ordersReducer(sent, {
    type: 'UPDATE_ORDER_ITEM_STATUS',
    payload: { orderId: 'o1', orderItemId: 'i2', status: 'cancelled' },
  })

  assert.equal(cancelled.orders[0].status, 'sent_to_kitchen')
  assert.equal(cancelled.orders[0].items.find(i => i.id === 'i1').status, 'new')
  assert.equal(cancelled.orders[0].items.find(i => i.id === 'i2').status, 'cancelled')
  assert.equal(cancelled.orders[0].subtotal, 100000)
  assert.equal(cancelled.orders[0].total, 115000)
  assert.equal(cancelled.tables[0].status, 'occupied')
})

test('kitchen cancelling every billable item removes the zero-value order from cashier flow', () => {
  const sent = ordersReducer(state(), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'o1',
    _items: [
      { id: 'i1', menu_item_id: 'm1', name: 'Shashlik', price: 100000, quantity: 1, status: 'new' },
    ],
    payload: { orderType: 'dine_in' },
  })

  const cancelled = ordersReducer(sent, {
    type: 'UPDATE_ORDER_ITEM_STATUS',
    payload: { orderId: 'o1', orderItemId: 'i1', status: 'cancelled' },
  })

  assert.equal(cancelled.orders.length, 0)
  assert.equal(cancelled.tables[0].status, 'available')
})

test('admin reservation and disable flow keeps history-safe table lifecycle', () => {
  const reserved = tablesReducer(state(), {
    type: 'UPDATE_TABLE',
    payload: {
      id: 't1',
      name: 'Table 1',
      status: 'reserved',
      is_active: true,
      reserved_for_name: 'Aziz',
      reserved_for_phone: '+998901234567',
      reserved_at: '2026-05-21T19:00',
      reserved_until: '2026-05-21T21:00',
      reservation_notes: 'Birthday',
    },
  })

  assert.equal(reserved.tables[0].status, 'reserved')
  assert.equal(reserved.tables[0].reserved_for_name, 'Aziz')

  const seated = tablesReducer(reserved, {
    type: 'UPDATE_TABLE',
    payload: clearReservationPatch(reserved.tables[0]),
  })
  assert.equal(seated.tables[0].status, 'available')
  assert.equal(seated.tables[0].reserved_for_name, '')

  const disabled = tablesReducer(seated, {
    type: 'UPDATE_TABLE',
    payload: { ...seated.tables[0], is_active: false },
  })
  assert.equal(disabled.tables[0].is_active, false)
})
