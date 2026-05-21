import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canDeleteTable,
  canDisableTable,
  getReservationSummary,
  getWaiterTableStatus,
  hasActiveOrders,
  hasOrderHistory,
  isReservedTable,
} from '../src/lib/tableManagement.js'

const table = (overrides = {}) => ({ id: 't1', name: 'Table 1', status: 'available', is_active: true, ...overrides })
const order = (overrides = {}) => ({ id: 'o1', table_id: 't1', status: 'sent_to_kitchen', payment_status: 'unpaid', ...overrides })

test('table active order detection ignores paid cancelled and other-table orders', () => {
  assert.equal(hasActiveOrders('t1', [order()]), true)
  assert.equal(hasActiveOrders('t1', [order({ payment_status: 'paid' })]), false)
  assert.equal(hasActiveOrders('t1', [order({ status: 'cancelled' })]), false)
  assert.equal(hasActiveOrders('t1', [order({ table_id: 't2' })]), false)
})

test('table history remains true for paid orders so delete can be blocked', () => {
  assert.equal(hasOrderHistory('t1', [order({ payment_status: 'paid', status: 'paid' })]), true)
  assert.equal(hasOrderHistory('t1', [order({ table_id: 't2' })]), false)
})

test('disable is allowed for idle or historical tables but blocked for active orders', () => {
  assert.deepEqual(canDisableTable(table(), []), { ok: true, reason: null })
  assert.deepEqual(canDisableTable(table(), [order({ payment_status: 'paid', status: 'paid' })]), { ok: true, reason: null })
  assert.deepEqual(canDisableTable(table(), [order()]), { ok: false, reason: 'active_orders' })
})

test('delete is allowed only when the table has no active orders and no history', () => {
  assert.deepEqual(canDeleteTable(table(), []), { ok: true, reason: null })
  assert.deepEqual(canDeleteTable(table(), [order()]), { ok: false, reason: 'active_orders' })
  assert.deepEqual(canDeleteTable(table(), [order({ payment_status: 'paid', status: 'paid' })]), { ok: false, reason: 'order_history' })
})

test('reserved status requires an active table and exposes reservation details', () => {
  const reserved = table({
    status: 'reserved',
    reserved_for_name: 'Aziz',
    reserved_for_phone: '+998901234567',
    reserved_at: '2026-05-21T19:00',
    reserved_until: '2026-05-21T21:00',
    reservation_notes: 'Window seat',
  })

  assert.equal(isReservedTable(reserved), true)
  assert.deepEqual(getReservationSummary(reserved), {
    name: 'Aziz',
    phone: '+998901234567',
    startsAt: '2026-05-21T19:00',
    endsAt: '2026-05-21T21:00',
    notes: 'Window seat',
  })
  assert.equal(isReservedTable({ ...reserved, is_active: false }), false)
})

test('waiter table status shows reserved only when there are no active orders', () => {
  const reserved = table({ status: 'reserved' })
  assert.equal(getWaiterTableStatus(reserved, [], () => 'available'), 'reserved')
  assert.equal(getWaiterTableStatus(reserved, [order()], () => 'waiting_kitchen'), 'waiting_kitchen')
  assert.equal(getWaiterTableStatus(table(), [], () => 'available'), 'available')
})
