import test from 'node:test'
import assert from 'node:assert/strict'

import { ordersReducer } from '../src/store/ordersReducer.js'

function submissionItem(overrides = {}) {
  return {
    id: 'submitted-item-1',
    menu_item_id: 'menu-1',
    name: 'Kebab',
    price: 50000,
    quantity: 1,
    status: 'new',
    ...overrides,
  }
}

function baseState(overrides = {}) {
  return {
    settings: { serviceRate: 15 },
    user: { id: 'waiter-1', name: 'Waiter' },
    currentTableId: 'table-b',
    tables: [
      { id: 'table-a', name: 'Table A', status: 'available' },
      { id: 'table-b', name: 'Table B', status: 'available' },
    ],
    orders: [],
    cart: [],
    ...overrides,
  }
}

test('a delayed kitchen success applies to its captured table after the live route changes', () => {
  const next = ordersReducer(baseState({
    cart: [{ menu_item_id: 'menu-2', name: 'Tea', price: 10000, quantity: 1 }],
  }), {
    type: 'SEND_TO_KITCHEN',
    _tableId: 'table-a',
    _orderId: 'order-a',
    _kitchenRoundId: 'round-a',
    _items: [submissionItem()],
    payload: { orderType: 'dine_in' },
  })

  assert.equal(next.orders.length, 1)
  assert.equal(next.orders[0].id, 'order-a')
  assert.equal(next.orders[0].table_id, 'table-a')
  assert.equal(next.orders[0].table_name, 'Table A')
  assert.equal(next.tables.find(table => table.id === 'table-a').status, 'occupied')
  assert.equal(next.tables.find(table => table.id === 'table-b').status, 'available')
  assert.deepEqual(next.cart, [{ menu_item_id: 'menu-2', name: 'Tea', price: 10000, quantity: 1 }])
})

test('a reconciled kitchen round is applied even when the live cart was already cleared', () => {
  const next = ordersReducer(baseState(), {
    type: 'SEND_TO_KITCHEN',
    _tableId: 'table-a',
    _orderId: 'order-a',
    _kitchenRoundId: 'round-a',
    _items: [submissionItem()],
    payload: { orderType: 'dine_in' },
  })

  assert.equal(next.orders.length, 1)
  assert.equal(next.orders[0].table_id, 'table-a')
  assert.deepEqual(next.orders[0].items.map(item => item.id), ['submitted-item-1'])
  assert.equal(next.tables.find(table => table.id === 'table-a').status, 'occupied')
  assert.deepEqual(next.cart, [])
})

test('an already-loaded advanced order keeps its status and table state during replay', () => {
  const advancedOrder = {
    id: 'order-a',
    table_id: 'table-a',
    table_name: 'Table A',
    status: 'needs_bill',
    payment_status: 'unpaid',
    subtotal: 50000,
    service_fee: 7500,
    total: 57500,
    items: [submissionItem({ status: 'ready' })],
  }
  const state = baseState({
    tables: [
      { id: 'table-a', name: 'Table A', status: 'needs_bill' },
      { id: 'table-b', name: 'Table B', status: 'available' },
    ],
    orders: [advancedOrder],
    cart: [
      { menu_item_id: 'menu-1', name: 'Kebab', price: 50000, quantity: 2 },
      { menu_item_id: 'menu-2', name: 'Tea', price: 10000, quantity: 1 },
    ],
  })

  const next = ordersReducer(state, {
    type: 'SEND_TO_KITCHEN',
    _tableId: 'table-a',
    _orderId: 'order-a',
    _kitchenRoundId: 'round-a',
    _items: [submissionItem()],
    payload: { orderType: 'dine_in' },
  })

  assert.strictEqual(next.orders, state.orders)
  assert.strictEqual(next.tables, state.tables)
  assert.equal(next.orders[0].status, 'needs_bill')
  assert.equal(next.tables[0].status, 'needs_bill')
  assert.deepEqual(next.cart, [
    { menu_item_id: 'menu-1', name: 'Kebab', price: 50000, quantity: 1 },
    { menu_item_id: 'menu-2', name: 'Tea', price: 10000, quantity: 1 },
  ])
})

test('an exact paid-order replay clears its submitted cart without reopening the order', () => {
  const paidOrder = {
    id: 'order-a',
    table_id: 'table-a',
    table_name: 'Table A',
    status: 'paid',
    payment_status: 'paid',
    paid_at: '2026-08-14T12:00:00.000Z',
    subtotal: 50000,
    service_fee: 7500,
    total: 57500,
    items: [submissionItem({ status: 'served' })],
  }
  const state = baseState({
    tables: [
      { id: 'table-a', name: 'Table A', status: 'available' },
      { id: 'table-b', name: 'Table B', status: 'available' },
    ],
    orders: [paidOrder],
    cart: [{ menu_item_id: 'menu-1', name: 'Kebab', price: 50000, quantity: 1 }],
  })

  const next = ordersReducer(state, {
    type: 'SEND_TO_KITCHEN',
    _tableId: 'table-a',
    _orderId: 'order-a',
    _kitchenRoundId: 'round-a',
    _items: [submissionItem()],
    payload: { orderType: 'dine_in' },
  })

  assert.strictEqual(next.orders, state.orders)
  assert.strictEqual(next.tables, state.tables)
  assert.equal(next.orders[0].status, 'paid')
  assert.equal(next.orders[0].payment_status, 'paid')
  assert.equal(next.tables[0].status, 'available')
  assert.deepEqual(next.cart, [])
})

test('an explicitly reconciled round is cart-only when its paid order is absent locally', () => {
  const state = baseState({
    cart: [
      { menu_item_id: 'menu-1', name: 'Kebab', price: 50000, quantity: 1 },
      { menu_item_id: 'menu-2', name: 'Tea', price: 10000, quantity: 1 },
    ],
  })

  const next = ordersReducer(state, {
    type: 'SEND_TO_KITCHEN',
    _tableId: 'table-a',
    _orderId: 'paid-order-not-in-operational-state',
    _kitchenRoundId: 'round-a',
    _kitchenSubmissionReconciled: true,
    _items: [submissionItem()],
    payload: { orderType: 'dine_in' },
  })

  assert.strictEqual(next.orders, state.orders)
  assert.strictEqual(next.tables, state.tables)
  assert.deepEqual(next.cart, [
    { menu_item_id: 'menu-2', name: 'Tea', price: 10000, quantity: 1 },
  ])
})
