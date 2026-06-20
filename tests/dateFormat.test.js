import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateOnly, formatDateTime, formatLongDate, formatLongDateTime, formatTime, normalizeDateLang } from '../src/lib/dateFormat.js'

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

test('long date formatter localizes month names', () => {
  assert.equal(formatLongDate('2026-06-20', 'en'), '20 June 2026')
  assert.equal(formatLongDate('2026-06-20', 'ru'), '20 июня 2026')
  assert.equal(formatLongDate('2026-06-20', 'uz'), '20 iyun 2026')
  assert.equal(formatLongDate('2026-06-20', 'uz-UZ'), '20 iyun 2026')
  assert.equal(formatLongDate('2026-06-20', 'en', '', { includeYear: false }), '20 June')
  assert.equal(normalizeDateLang('ru-RU'), 'ru')
  assert.equal(normalizeDateLang('unknown'), 'en')
})

test('long date time formatter localizes month names and keeps hour minutes', () => {
  assert.equal(formatLongDateTime('2026-06-20T17:24:00', 'en'), '20 June 2026 17:24')
  assert.equal(formatLongDateTime('2026-06-20T17:24:00', 'ru'), '20 июня 2026 17:24')
  assert.equal(formatLongDateTime('2026-06-20T17:24:00', 'uz'), '20 iyun 2026 17:24')
  assert.equal(formatLongDateTime('2026-06-20T17:24:00', 'en', '', { includeYear: false }), '20 June 17:24')
})
