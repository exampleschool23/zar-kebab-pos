import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  collectPagedRows,
  getOrderHistoryRangeBounds,
  mergeOrderHistory,
  mergePaidOrderHistory,
} from '../src/lib/orderHistory.js'

test('order history range uses inclusive Tashkent dates and an exclusive next-day bound', () => {
  assert.deepEqual(getOrderHistoryRangeBounds('2025-12-01', '2025-12-31'), {
    dateFrom: '2025-12-01',
    dateTo: '2025-12-31',
    instantFrom: '2025-12-01T00:00:00+05:00',
    instantToExclusive: '2026-01-01T00:00:00+05:00',
  })
})

test('full report history merges paid, unpaid, and cancelled rows for the selected range', () => {
  const history = [
    { id: 'paid', payment_status: 'paid', paid_at: '2025-12-03T10:00:00+05:00' },
    { id: 'cancelled', status: 'cancelled', created_at: '2025-12-04T10:00:00+05:00' },
    { id: 'outside', status: 'cancelled', created_at: '2026-01-01T10:00:00+05:00' },
  ]
  const live = [
    { id: 'paid', payment_status: 'paid', paid_at: '2025-12-03T10:00:00+05:00', total: 250 },
    { id: 'unpaid', payment_status: 'unpaid', created_at: '2025-12-05T10:00:00+05:00' },
  ]

  const merged = mergeOrderHistory(history, live, '2025-12-01', '2025-12-31')
  assert.deepEqual([...merged].sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.id, row.total || 0]), [
    ['cancelled', 0],
    ['paid', 250],
    ['unpaid', 0],
  ])
})

test('order history pagination reads every page without truncating at one response', async () => {
  const source = Array.from({ length: 1_205 }, (_, index) => ({ id: `order-${index}` }))
  const ranges = []
  const rows = await collectPagedRows(async (from, to) => {
    ranges.push([from, to])
    return { data: source.slice(from, to + 1), error: null }
  }, 500)

  assert.equal(rows.length, 1_205)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
})

test('active order query explicitly includes legacy null payment and status values', () => {
  const source = readFileSync(new URL('../src/lib/orderHistory.js', import.meta.url), 'utf8')
  assert.match(source, /payment_status\.neq\.paid,payment_status\.is\.null/)
  assert.match(source, /status\.not\.in\.\(paid,completed,cancelled\),status\.is\.null/)
  assert.match(source, /export async function loadActiveOrders/)
})

test('live paid orders replace fetched history without admitting unpaid or out-of-range rows', () => {
  const history = [
    { id: 'same', payment_status: 'paid', paid_at: '2026-07-10T10:00:00+05:00', total: 100 },
    { id: 'history', payment_status: 'paid', paid_at: '2026-07-11T10:00:00+05:00', total: 200 },
  ]
  const live = [
    { id: 'same', payment_status: 'paid', paid_at: '2026-07-10T10:00:00+05:00', total: 150 },
    { id: 'new', payment_status: 'paid', paid_at: '2026-07-12T10:00:00+05:00', total: 300 },
    { id: 'unpaid', payment_status: 'unpaid', created_at: '2026-07-12T10:00:00+05:00', total: 900 },
    { id: 'outside', payment_status: 'paid', paid_at: '2026-06-30T10:00:00+05:00', total: 700 },
  ]

  const merged = mergePaidOrderHistory(history, live, '2026-07-01', '2026-07-31')
  assert.deepEqual([...merged].sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.id, row.total]), [
    ['history', 200],
    ['new', 300],
    ['same', 150],
  ])
})
