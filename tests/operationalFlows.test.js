import test from 'node:test'
import assert from 'node:assert/strict'
import { ordersReducer } from '../src/store/ordersReducer.js'
import { tablesReducer } from '../src/store/tablesReducer.js'
import { clearReservationPatch } from '../src/lib/tableActivity.js'

const state = () => ({
  settings: { serviceRate: 15 },
  user: { id: 'user-1', name: 'Jasurbek' },
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
  assert.equal(sent.orders[0].opened_by, 'user-1')
  assert.equal(sent.orders[0].opened_by_name, 'Jasurbek')
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
  assert.equal(paid.orders[0].completed_by, 'user-1')
  assert.equal(paid.orders[0].completed_by_name, 'Jasurbek')
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
  assert.equal(cancelled.orders[0].items.some(i => i.id === 'i2'), false)
  assert.equal(cancelled.orders[0].subtotal, 100000)
  assert.equal(cancelled.orders[0].total, 115000)
  assert.equal(cancelled.tables[0].status, 'occupied')

  const allPreparing = ordersReducer(cancelled, {
    type: 'UPDATE_ORDER_ITEM_STATUS',
    payload: { orderId: 'o1', orderItemId: 'i1', status: 'preparing' },
  })
  assert.equal(allPreparing.orders[0].items.length, 1)
  assert.equal(allPreparing.orders[0].items[0].id, 'i1')
  assert.equal(allPreparing.orders[0].items[0].status, 'preparing')
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

test('requested-bill quantity edits can reduce or remove served items before payment', () => {
  const base = {
    ...state(),
    tables: [{ id: 't1', name: 'Table 1', status: 'needs_bill', is_active: true }],
    orders: [
      {
        id: 'o1',
        table_id: 't1',
        status: 'needs_bill',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 15,
        items: [
          { id: 'i1', menu_item_id: 'm1', name: 'Shashlik', price: 100000, quantity: 3, status: 'served' },
          { id: 'i2', menu_item_id: 'm2', name: 'Tea', price: 10000, quantity: 1, status: 'served' },
        ],
        subtotal: 310000,
        service_fee: 46500,
        total: 356500,
      },
    ],
    cart: [],
  }

  const reduced = ordersReducer(base, {
    type: 'UPDATE_BILL_ITEM_QTY',
    payload: { tableId: 't1', orderId: 'o1', orderItemId: 'i1', menuItemId: 'm1', qty: 2 },
  })

  assert.equal(reduced.orders[0].items.find(i => i.id === 'i1').quantity, 2)
  assert.equal(reduced.orders[0].subtotal, 210000)
  assert.equal(reduced.orders[0].total, 241500)
  assert.equal(reduced.tables[0].status, 'needs_bill')

  const removedOne = ordersReducer(reduced, {
    type: 'UPDATE_BILL_ITEM_QTY',
    payload: { tableId: 't1', orderId: 'o1', orderItemId: 'i2', menuItemId: 'm2', qty: 0 },
  })

  assert.equal(removedOne.orders[0].items.some(i => i.id === 'i2'), false)
  assert.equal(removedOne.orders[0].subtotal, 200000)
  assert.equal(removedOne.orders[0].total, 230000)

  const removedLast = ordersReducer(removedOne, {
    type: 'UPDATE_BILL_ITEM_QTY',
    payload: { tableId: 't1', orderId: 'o1', orderItemId: 'i1', menuItemId: 'm1', qty: 0 },
  })

  assert.equal(removedLast.orders.length, 0)
  assert.equal(removedLast.tables[0].status, 'available')
})

test('cashier can move requested bill back to occupied table for waiter additions', () => {
  const base = {
    ...state(),
    tables: [{ id: 't1', name: 'Table 1', status: 'needs_bill', is_active: true }],
    orders: [
      {
        id: 'o1',
        table_id: 't1',
        status: 'needs_bill',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        items: [{ id: 'i1', menu_item_id: 'm1', name: 'Shashlik', price: 100000, quantity: 1, status: 'served' }],
      },
      {
        id: 'o2',
        table_id: 't1',
        status: 'paid',
        payment_status: 'paid',
        order_type: 'dine_in',
        items: [],
      },
    ],
  }

  const recalled = ordersReducer(base, { type: 'RECALL_TABLE_FROM_CASHIER', payload: 't1' })

  assert.equal(recalled.tables[0].status, 'occupied')
  assert.equal(recalled.orders.find(order => order.id === 'o1').status, 'delivered')
  assert.equal(recalled.orders.find(order => order.id === 'o2').status, 'paid')
})

test('request bill and recall stamp local status update times for elapsed labels', () => {
  const base = {
    ...state(),
    tables: [{ id: 't1', name: 'Table 1', status: 'occupied', is_active: true }],
    orders: [
      {
        id: 'o1',
        table_id: 't1',
        status: 'delivered',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        created_at: '2026-06-22T07:00:00.000Z',
        updated_at: '2026-06-22T07:00:00.000Z',
        items: [{ id: 'i1', status: 'served' }],
      },
    ],
  }

  const requestedAt = '2026-06-29T07:59:00.000Z'
  const needsBill = ordersReducer(base, {
    type: 'MARK_TABLE_NEEDS_BILL',
    payload: 't1',
    _statusChangedAt: requestedAt,
  })

  assert.equal(needsBill.tables[0].updated_at, requestedAt)
  assert.equal(needsBill.orders[0].updated_at, requestedAt)

  const recalledAt = '2026-06-29T08:10:00.000Z'
  const recalled = ordersReducer(needsBill, {
    type: 'RECALL_TABLE_FROM_CASHIER',
    payload: 't1',
    _statusChangedAt: recalledAt,
  })

  assert.equal(recalled.tables[0].updated_at, recalledAt)
  assert.equal(recalled.orders[0].updated_at, recalledAt)
})

test('owner order deletion removes the order and resets table only when no active orders remain', () => {
  const base = {
    ...state(),
    tables: [{ id: 't1', name: 'Table 1', status: 'needs_bill', is_active: true }],
    orders: [
      { id: 'o1', table_id: 't1', status: 'needs_bill', payment_status: 'unpaid', items: [] },
      { id: 'o2', table_id: 't1', status: 'sent_to_kitchen', payment_status: 'unpaid', items: [] },
      { id: 'o3', table_id: null, table_name: 'Take Away', status: 'paid', payment_status: 'paid', items: [] },
    ],
  }

  const firstDelete = ordersReducer(base, { type: 'DELETE_ORDER', payload: { orderId: 'o1' } })
  assert.deepEqual(firstDelete.orders.map(order => order.id), ['o2', 'o3'])
  assert.equal(firstDelete.tables[0].status, 'needs_bill')

  const secondDelete = ordersReducer(firstDelete, { type: 'DELETE_ORDER', payload: { orderId: 'o2' } })
  assert.deepEqual(secondDelete.orders.map(order => order.id), ['o3'])
  assert.equal(secondDelete.tables[0].status, 'available')

  const takeAwayDelete = ordersReducer(secondDelete, { type: 'DELETE_ORDER', payload: { orderId: 'o3' } })
  assert.equal(takeAwayDelete.orders.length, 0)
  assert.equal(takeAwayDelete.tables[0].status, 'available')
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
