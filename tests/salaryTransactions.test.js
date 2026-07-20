import test from 'node:test'
import assert from 'node:assert/strict'

import { compareSalaryTransactionsNewestFirst } from '../src/lib/salaryTransactions.js'

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
