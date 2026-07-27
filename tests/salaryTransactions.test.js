import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compareSalaryAbsencesNewestFirst,
  compareSalaryTransactionsNewestFirst,
} from '../src/lib/salaryTransactions.js'

test('salary payments bonuses and fines sort by date then newest recorded time', () => {
  const rows = [
    { id: 'payment-old', date: '2026-07-20', createdAt: '2026-07-20T08:15:00+05:00' },
    { id: 'fine-new', date: '2026-07-20', createdAt: '2026-07-20T18:45:00+05:00' },
    { id: 'bonus-previous-day', date: '2026-07-19', createdAt: '2026-07-21T09:00:00+05:00' },
  ]

  assert.deepEqual(
    rows.sort(compareSalaryTransactionsNewestFirst).map(row => row.id),
    ['fine-new', 'payment-old', 'bonus-previous-day']
  )
})

test('salary transaction ordering remains deterministic when timestamps are missing', () => {
  const rows = [
    { id: 'a', date: '2026-07-20' },
    { id: 'b', date: '2026-07-20', createdAt: '2026-07-20T10:00:00Z' },
    { id: 'c', date: '2026-07-20' },
  ]

  assert.deepEqual(
    rows.sort(compareSalaryTransactionsNewestFirst).map(row => row.id),
    ['b', 'c', 'a']
  )
})

test('salary absences sort by newest absence date regardless of database row order', () => {
  const rows = [
    { id: 'june-20', absence_date: '2026-06-20' },
    { id: 'june-28', absence_date: '2026-06-28' },
    { id: 'july-24', absence_date: '2026-07-24' },
    { id: 'july-25', absence_date: '2026-07-25' },
    { id: 'july-26', absence_date: '2026-07-26' },
  ]

  assert.deepEqual(
    rows.sort(compareSalaryAbsencesNewestFirst).map(row => row.id),
    ['july-26', 'july-25', 'july-24', 'june-28', 'june-20']
  )
})
