import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearReservationPatch,
  compactTimelineLabels,
  getTableActivityTimeline,
  getTodaysReservations,
} from '../src/lib/tableActivity.js'

const baseTable = (overrides = {}) => ({
  id: 't1',
  name: 'Table 1',
  status: 'available',
  is_active: true,
  ...overrides,
})

test('today reservations include only active reserved tables for the local day sorted by time', () => {
  const tables = [
    baseTable({ id: 'late', name: 'Late', status: 'reserved', reserved_for_name: 'Late Guest', reserved_at: '2026-05-21T21:00:00+05:00' }),
    baseTable({ id: 'early', name: 'Early', status: 'reserved', reserved_for_name: 'Early Guest', reserved_at: '2026-05-21T18:00:00+05:00' }),
    baseTable({ id: 'tomorrow', status: 'reserved', reserved_at: '2026-05-22T18:00:00+05:00' }),
    baseTable({ id: 'disabled', status: 'reserved', is_active: false, reserved_at: '2026-05-21T17:00:00+05:00' }),
  ]

  const reservations = getTodaysReservations(tables, new Date('2026-05-21T12:00:00+05:00'))

  assert.deepEqual(reservations.map(row => row.table.id), ['early', 'late'])
})

test('clearReservationPatch removes guest details without losing table metadata', () => {
  const table = baseTable({
    zone_name: 'VIP',
    capacity: 6,
    status: 'reserved',
    reserved_for_name: 'Aziz',
    reserved_for_phone: '+99890',
    reserved_at: '2026-05-21T19:00',
    reserved_until: '2026-05-21T21:00',
    reservation_notes: 'Window',
  })

  assert.deepEqual(clearReservationPatch(table), {
    ...table,
    status: 'available',
    reserved_for_name: '',
    reserved_for_phone: '',
    reserved_at: null,
    reserved_until: null,
    reservation_notes: '',
  })
})

test('table activity timeline shows operational milestones in order', () => {
  const table = baseTable({ status: 'needs_bill' })
  const orders = [{
    id: 'o1',
    table_id: 't1',
    status: 'needs_bill',
    payment_status: 'paid',
    created_at: '2026-05-21T10:00:00.000Z',
    updated_at: '2026-05-21T10:25:00.000Z',
    paid_at: '2026-05-21T10:30:00.000Z',
    items: [
      { id: 'i1', status: 'served', created_at: '2026-05-21T10:02:00.000Z', updated_at: '2026-05-21T10:12:00.000Z' },
    ],
  }]

  assert.deepEqual(
    getTableActivityTimeline(table, orders).map(event => event.key),
    ['seated', 'sent_to_kitchen', 'ready', 'served', 'bill_requested', 'paid']
  )
  assert.deepEqual(compactTimelineLabels(table, orders, 2), ['Bill requested', 'Paid'])
})
