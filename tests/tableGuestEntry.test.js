import assert from 'node:assert/strict'
import test from 'node:test'

import { getTableGuestEntryContext } from '../src/lib/tableGuestEntry.js'

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
    { id: 'b', table_id: 't1', payment_status: 'unpaid', price_mode: 'tourist' },
    { id: 'a', table_id: 't1', payment_status: null, price_mode: 'tourist' },
    { id: 'paid', table_id: 't1', payment_status: 'paid', price_mode: 'regular' },
    { id: 'other', table_id: 't2', payment_status: 'unpaid', price_mode: 'regular' },
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
    { id: 'a', table_id: 't1', payment_status: 'unpaid', price_mode: 'regular' },
    { id: 'b', table_id: 't1', payment_status: 'unpaid', price_mode: 'tourist' },
  ])

  assert.equal(context.hasConflictingPriceModes, true)
  assert.equal(context.priceModeLocked, true)
})

test('legacy active orders derive their locked mode from priced items', () => {
  const tourist = getTableGuestEntryContext('t1', [{
    id: 'legacy',
    table_id: 't1',
    payment_status: 'unpaid',
    items: [{ id: 'i1', price_mode: 'tourist' }],
  }])
  assert.equal(tourist.priceMode, 'tourist')
  assert.equal(tourist.hasConflictingPriceModes, false)

  const regular = getTableGuestEntryContext('t1', [{
    id: 'older-legacy',
    table_id: 't1',
    payment_status: 'unpaid',
    items: [{ id: 'i2' }],
  }])
  assert.equal(regular.priceMode, 'regular')
})
