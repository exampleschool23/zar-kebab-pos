import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSalaryHistoryCalendar,
  buildSalaryHistoryEntries,
  filterSalaryHistoryEntries,
  groupSalaryHistoryEntries,
  normalizeSalaryHistoryMonth,
  shiftSalaryHistoryMonth,
  summarizeSalaryHistoryMonth,
} from '../src/lib/salaryHistory.js'

test('salary history maps all record types and sorts by effective date then recorded time', () => {
  const entries = buildSalaryHistoryEntries({
    payments: [{
      id: 'payment-old',
      paid_date: '2026-08-08',
      created_at: '2026-08-08T10:06:00+05:00',
      amount: '500000',
      payment_method: 'card',
    }],
    bonuses: [{
      id: 'bonus-new',
      bonus_date: '2026-08-08',
      created_at: '2026-08-08T11:06:00+05:00',
      amount: 100000,
      note: 'Great shift',
    }],
    fines: [{
      id: 'fine',
      fine_date: '2026-08-07',
      created_at: '2026-08-09T09:00:00+05:00',
      amount: 25000,
      reason: 'Late',
    }],
    absences: [{
      id: 'absence',
      absence_date: '2026-08-06',
      created_at: '2026-08-06T08:00:00+05:00',
      note: 'Sick day',
    }],
  })

  assert.deepEqual(entries.map(entry => entry.id), ['bonus-new', 'payment-old', 'fine', 'absence'])
  assert.deepEqual(entries.map(entry => entry.entryType), ['bonus', 'payment', 'fine', 'absence'])
  assert.equal(entries[1].paymentMethod, 'card')
  assert.equal(entries[2].detail, 'Late')
  assert.equal(entries[3].amount, 0)
})

test('salary history calendar is Monday-first, fixed-height, and marks activity and today', () => {
  const entries = buildSalaryHistoryEntries({
    payments: [{ id: 'payment', paid_date: '2026-08-08', amount: 500000 }],
    bonuses: [{ id: 'bonus', bonus_date: '2026-08-08', amount: 100000 }],
    absences: [{ id: 'absence', absence_date: '2026-08-10' }],
  })
  const days = buildSalaryHistoryCalendar('2026-08', entries, '2026-08-08')

  assert.equal(days.length, 42)
  assert.equal(days[0].date, '2026-07-27')
  assert.equal(days.at(-1).date, '2026-09-06')
  assert.equal(days.find(day => day.date === '2026-08-08').isToday, true)
  assert.deepEqual(days.find(day => day.date === '2026-08-08').entryTypes.sort(), ['bonus', 'payment'])
  assert.equal(days.find(day => day.date === '2026-08-10').entries.length, 1)
})

test('salary history month and day filters preserve grouped newest-first activity', () => {
  const entries = buildSalaryHistoryEntries({
    payments: [
      { id: 'aug-8', paid_date: '2026-08-08', amount: 500000 },
      { id: 'july', paid_date: '2026-07-30', amount: 200000 },
    ],
    bonuses: [{ id: 'aug-7', bonus_date: '2026-08-07', amount: 100000 }],
    fines: [{ id: 'aug-fine', fine_date: '2026-08-08', amount: 25000 }],
    absences: [{ id: 'aug-absence', absence_date: '2026-08-05' }],
  })

  const august = filterSalaryHistoryEntries(entries, { month: '2026-08' })
  const augustPayments = filterSalaryHistoryEntries(entries, { month: '2026-08', entryType: 'payment' })
  const augustEighth = filterSalaryHistoryEntries(entries, { month: '2026-08', date: '2026-08-08' })
  const groups = groupSalaryHistoryEntries(august)
  const summary = summarizeSalaryHistoryMonth(entries, '2026-08')

  assert.equal(august.length, 4)
  assert.deepEqual(augustPayments.map(entry => entry.id), ['aug-8'])
  assert.deepEqual(augustEighth.map(entry => entry.id), ['aug-fine', 'aug-8'])
  assert.deepEqual(groups.map(group => group.date), ['2026-08-08', '2026-08-07', '2026-08-05'])
  assert.deepEqual(summary, {
    paymentAmount: 500000,
    bonusAmount: 100000,
    fineAmount: 25000,
    absenceCount: 1,
    entryCount: 4,
  })
})

test('salary history month navigation crosses years and rejects invalid months', () => {
  assert.equal(shiftSalaryHistoryMonth('2026-01', -1), '2025-12')
  assert.equal(shiftSalaryHistoryMonth('2026-12', 1), '2027-01')
  assert.equal(normalizeSalaryHistoryMonth('2026-13', '2026-08'), '2026-08')
  assert.equal(normalizeSalaryHistoryMonth('not-a-month', '2026-08'), '2026-08')
})
