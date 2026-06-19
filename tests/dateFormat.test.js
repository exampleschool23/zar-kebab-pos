import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateOnly, formatDateTime, formatTime } from '../src/lib/dateFormat.js'

test('date display helpers use one numeric local format', () => {
  assert.equal(formatDateTime('2026-06-18T15:21:00'), '18.06.2026 15:21')
  assert.equal(formatDateOnly('2026-06-18'), '18.06.2026')
  assert.equal(formatTime('2026-06-18T05:07:00'), '05:07')
})

test('date display helpers return fallbacks for invalid values', () => {
  assert.equal(formatDateTime('', '—'), '—')
  assert.equal(formatDateOnly('not-a-date', 'bad date'), 'bad date')
  assert.equal(formatTime(null), '')
})
