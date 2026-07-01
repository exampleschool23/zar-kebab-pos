import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  elapsedMinutesSince,
  formatDateOnly,
  formatDateTime,
  formatElapsedSince,
  formatLongDate,
  formatLongDateTime,
  formatTime,
  normalizeDateLang,
  parseInstantDate,
  RESTAURANT_TIME_ZONE,
  RESTAURANT_UTC_OFFSET,
  RESTAURANT_UTC_OFFSET_MINUTES,
} from '../src/lib/dateFormat.js'

test('date display helpers use one numeric Tashkent format', () => {
  assert.equal(RESTAURANT_TIME_ZONE, 'Asia/Tashkent')
  assert.equal(RESTAURANT_UTC_OFFSET, '+05:00')
  assert.equal(RESTAURANT_UTC_OFFSET_MINUTES, 300)
  assert.equal(formatDateTime('2026-06-18T15:21:00'), '18.06.2026 15:21')
  assert.equal(formatDateTime('2026-06-18T10:21:00Z'), '18.06.2026 15:21')
  assert.equal(formatDateOnly('2026-06-18'), '18.06.2026')
  assert.equal(formatTime('2026-06-18T05:07:00'), '05:07')
  assert.equal(formatTime('2026-06-18T00:07:00Z'), '05:07')
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
  assert.equal(formatLongDateTime('2026-06-20T12:24:00Z', 'en'), '20 June 2026 17:24')
  assert.equal(formatLongDateTime('2026-06-20T17:24:00', 'ru'), '20 июня 2026 17:24')
  assert.equal(formatLongDateTime('2026-06-20T17:24:00', 'uz'), '20 iyun 2026 17:24')
  assert.equal(formatLongDateTime('2026-06-20T17:24:00', 'en', '', { includeYear: false }), '20 June 17:24')
})

test('instant parser treats timezone-less database timestamps as Tashkent UTC+05 moments', () => {
  assert.equal(parseInstantDate('2026-07-01T10:00:00').toISOString(), '2026-07-01T05:00:00.000Z')
  assert.equal(parseInstantDate('2026-07-01 10:00:00.123').toISOString(), '2026-07-01T05:00:00.123Z')
  assert.equal(parseInstantDate('2026-07-01').toISOString(), '2026-06-30T19:00:00.000Z')
  assert.equal(parseInstantDate('2026-07-01T10:00:00+05:00').toISOString(), '2026-07-01T05:00:00.000Z')
})

test('elapsed helpers do not turn a five minute old database timestamp into hours', () => {
  const now = '2026-07-01T10:05:00+05:00'

  assert.equal(elapsedMinutesSince('2026-07-01T10:00:00', now), 5)
  assert.equal(elapsedMinutesSince('2026-07-01 10:00:00', now), 5)
  assert.equal(formatElapsedSince('2026-07-01T10:00:00', {
    now,
    lessThanMinute: 'just now',
    minutes: n => `${n} min ago`,
    hoursMinutes: (h, m) => `${h}h ${m}m ago`,
  }), '5 min ago')
})

test('elapsed helpers clamp future timestamps caused by minor client clock skew', () => {
  assert.equal(elapsedMinutesSince('2026-07-01T10:06:00Z', '2026-07-01T10:05:00Z'), 0)
  assert.equal(formatElapsedSince('2026-07-01T10:06:00Z', { now: '2026-07-01T10:05:00Z', lessThanMinute: 'just now' }), 'just now')
})

test('date display helpers ignore the client device timezone', () => {
  const moduleUrl = new URL('../src/lib/dateFormat.js', import.meta.url).href
  const script = [
    `import { formatDateTime, formatTime } from ${JSON.stringify(moduleUrl)}`,
    `console.log([formatDateTime('2026-07-01T05:07:00Z'), formatTime('2026-07-01T05:07:00Z')].join('|'))`,
  ].join(';')
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '01.07.2026 10:07|10:07')
})
