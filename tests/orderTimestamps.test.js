import test from 'node:test'
import assert from 'node:assert/strict'

import {
  earliestReliableTime,
  getReliableOrderItemTime,
} from '../src/lib/orderTimestamps.js'

test('waiter elapsed time prefers server item created_at over stale client submitted_at', () => {
  const order = { created_at: '2026-07-01T08:42:01.313707+00:00' }
  const item = {
    created_at: '2026-07-01T08:42:01.313707+00:00',
    submitted_at: '2026-07-01T05:39:43.635+00:00',
  }

  assert.equal(getReliableOrderItemTime(item, order), item.created_at)
})

test('waiter elapsed time still supports legacy submitted_at-only item rows', () => {
  const item = { submitted_at: '2026-07-01T08:42:01.313707+00:00' }

  assert.equal(getReliableOrderItemTime(item), item.submitted_at)
})

test('waiter elapsed time skips malformed item timestamps', () => {
  const item = {
    created_at: 'bad-date',
    submitted_at: '2026-07-01T08:42:01.313707+00:00',
  }

  assert.equal(getReliableOrderItemTime(item), item.submitted_at)
})

test('earliest reliable time sorts using timezone-safe instant parsing', () => {
  assert.equal(earliestReliableTime([
    '2026-07-01T13:43:00+05:00',
    '2026-07-01T08:42:00+00:00',
    'bad-date',
  ]), '2026-07-01T08:42:00+00:00')
})
