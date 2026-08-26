import assert from 'node:assert/strict'
import test from 'node:test'

import { getActiveTableOrders, getTableGuestEntryContext } from '../src/lib/tableGuestEntry.js'

test('a new table asks staff to choose its pricing mode', () => {
  assert.deepEqual(getTableGuestEntryContext('t1', []), {
    activeOrderIds: [],
    hasActiveOrders: false,
    hasConflictingPriceModes: false,
    priceMode: 'regular',
    priceModeLocked: false,
  })
})

test('an active table preserves its saved mode and sorted order identity', () => {
  const context = getTableGuestEntryContext('t1', [
    { id: 'b', table_id: 't1', payment_status: 'unpaid', price_mode: 'tourist', items: [{ id: 'b1', price: 10_000 }] },
    { id: 'a', table_id: 't1', payment_status: null, price_mode: 'tourist', items: [{ id: 'a1', price: 15_000 }] },
    { id: 'paid', table_id: 't1', payment_status: 'paid', price_mode: 'regular', items: [{ id: 'p1', price: 10_000 }] },
    { id: 'other', table_id: 't2', payment_status: 'unpaid', price_mode: 'regular', items: [{ id: 'o1', price: 10_000 }] },
  ])

  assert.deepEqual(context, {
    activeOrderIds: ['a', 'b'],
    hasActiveOrders: true,
    hasConflictingPriceModes: false,
    priceMode: 'tourist',
    priceModeLocked: true,
  })
})

test('mixed active pricing modes require staff review instead of guessing', () => {
  const context = getTableGuestEntryContext('t1', [
    { id: 'a', table_id: 't1', payment_status: 'unpaid', price_mode: 'regular', items: [{ id: 'a1', price: 10_000 }] },
    { id: 'b', table_id: 't1', payment_status: 'unpaid', price_mode: 'tourist', items: [{ id: 'b1', price: 10_000 }] },
  ])

  assert.equal(context.hasConflictingPriceModes, true)
  assert.equal(context.priceModeLocked, true)
})

test('empty unpaid order shells do not lock the Guest pricing option', () => {
  const orders = [{
    id: 'empty-shell',
    table_id: 't1',
    payment_status: 'unpaid',
    status: 'sent_to_kitchen',
    price_mode: 'regular',
    subtotal: 65_000,
    total: 78_000,
    items: [],
  }]
  const context = getTableGuestEntryContext('t1', orders)

  assert.deepEqual(getActiveTableOrders('t1', orders), [])
  assert.deepEqual(context, {
    activeOrderIds: [],
    hasActiveOrders: false,
    hasConflictingPriceModes: false,
    priceMode: 'regular',
    priceModeLocked: false,
  })
})

test('waiter ordering ignores an empty Regular shell while retaining a real Tourist order', () => {
  const orders = [
    {
      id: 'empty-regular-shell',
      table_id: 't1',
      payment_status: 'unpaid',
      status: 'sent_to_kitchen',
      price_mode: 'regular',
      subtotal: 0,
      total: 0,
      items: [],
    },
    {
      id: 'real-tourist-order',
      table_id: 't1',
      payment_status: 'unpaid',
      status: 'sent_to_kitchen',
      price_mode: 'tourist',
      items: [{ id: 'tourist-item', quantity: 1, price: 36_000, price_mode: 'tourist' }],
    },
  ]

  assert.deepEqual(getActiveTableOrders('t1', orders).map(order => order.id), ['real-tourist-order'])
})

test('orders containing only cancelled items do not lock the Guest pricing option', () => {
  const context = getTableGuestEntryContext('t1', [{
    id: 'cancelled-items',
    table_id: 't1',
    payment_status: 'unpaid',
    price_mode: 'tourist',
    items: [{ id: 'i1', status: 'cancelled', price: 40_000 }],
  }])

  assert.equal(context.hasActiveOrders, false)
  assert.equal(context.priceModeLocked, false)
})

test('zero-value item rows and completed order states do not lock Guest pricing', () => {
  const context = getTableGuestEntryContext('t1', [
    {
      id: 'zero-price',
      table_id: 't1',
      payment_status: 'unpaid',
      items: [{ id: 'i1', quantity: 1, price: 0 }],
    },
    {
      id: 'completed',
      table_id: 't1',
      status: 'completed',
      items: [{ id: 'i2', quantity: 1, price: 20_000 }],
    },
    {
      id: 'paid-at',
      table_id: 't1',
      paid_at: '2026-08-12T10:00:00.000Z',
      items: [{ id: 'i3', quantity: 1, price: 20_000 }],
    },
    {
      id: 'cancelled-payment',
      table_id: 't1',
      payment_status: 'cancelled',
      items: [{ id: 'i4', quantity: 1, price: 20_000 }],
    },
  ])

  assert.equal(context.hasActiveOrders, false)
  assert.equal(context.priceModeLocked, false)
})

test('an empty Tourist shell cannot conflict with a real Regular order', () => {
  const context = getTableGuestEntryContext('t1', [
    {
      id: 'empty-tourist',
      table_id: 't1',
      payment_status: 'unpaid',
      price_mode: 'tourist',
      items: [],
    },
    {
      id: 'real-regular',
      table_id: 't1',
      payment_status: 'unpaid',
      price_mode: 'regular',
      items: [{ id: 'i1', quantity: 1, price: 20_000 }],
    },
  ])

  assert.deepEqual(context.activeOrderIds, ['real-regular'])
  assert.equal(context.priceMode, 'regular')
  assert.equal(context.hasConflictingPriceModes, false)
  assert.equal(context.priceModeLocked, true)
})

test('legacy active orders derive their locked mode from priced items', () => {
  const tourist = getTableGuestEntryContext('t1', [{
    id: 'legacy',
    table_id: 't1',
    payment_status: 'unpaid',
    items: [{ id: 'i1', price_mode: 'tourist', price: 10_000 }],
  }])
  assert.equal(tourist.priceMode, 'tourist')
  assert.equal(tourist.hasConflictingPriceModes, false)

  const regular = getTableGuestEntryContext('t1', [{
    id: 'older-legacy',
    table_id: 't1',
    payment_status: 'unpaid',
    items: [{ id: 'i2', price: 10_000 }],
  }])
  assert.equal(regular.priceMode, 'regular')
})
