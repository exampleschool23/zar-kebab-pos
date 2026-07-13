import test from 'node:test'
import assert from 'node:assert/strict'

import {
  allocateMonthlySalaryToDate,
  buildSalaryExpenseRows,
  getEstimatedMonthlyExpenseSummary,
  getMonthlySalaryCommitment,
  getSalaryDue,
  summarizeExpenses,
} from '../src/lib/expenses.js'

function monthlyProfile(overrides = {}) {
  return {
    id: 'monthly-salary-profile',
    profile_id: 'monthly-salary-user',
    employee_name: 'Monthly Employee',
    joined_at: '2026-01-01',
    is_active: true,
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-01-01', amount: 3_000_001, rate_unit: 'monthly' }],
    payments: [],
    absences: [],
    ...overrides,
  }
}

function salaryTotal(profile, dateFrom, dateTo) {
  return summarizeExpenses(buildSalaryExpenseRows([profile], dateFrom, dateTo)).total
}

test('monthly salary accrues to the exact configured amount in every calendar month length', () => {
  const profile = monthlyProfile()

  assert.equal(buildSalaryExpenseRows([profile], '2026-02-01', '2026-02-28').length, 28)
  assert.equal(salaryTotal(profile, '2026-02-01', '2026-02-28'), 3_000_001)
  assert.equal(buildSalaryExpenseRows([profile], '2028-02-01', '2028-02-29').length, 29)
  assert.equal(salaryTotal(profile, '2028-02-01', '2028-02-29'), 3_000_001)
  assert.equal(salaryTotal(profile, '2026-04-01', '2026-04-30'), 3_000_001)
  assert.equal(salaryTotal(profile, '2026-07-01', '2026-07-31'), 3_000_001)
})

test('monthly UZS rounding is deterministic and preserves the exact full-month total', () => {
  assert.equal(allocateMonthlySalaryToDate(100, '2026-02-01'), 4)
  assert.equal(allocateMonthlySalaryToDate(100, '2026-02-16'), 4)
  assert.equal(allocateMonthlySalaryToDate(100, '2026-02-17'), 3)
  assert.equal(allocateMonthlySalaryToDate(100, '2026-02-28'), 3)

  const profile = monthlyProfile({
    rates: [{ effective_from: '2026-02-01', amount: 100, rate_unit: 'monthly' }],
  })
  assert.equal(salaryTotal(profile, '2026-02-01', '2026-02-28'), 100)
})

test('monthly salary prorates partial employment and absences by that calendar month', () => {
  const joinedMidMonth = monthlyProfile({
    joined_at: '2026-07-16',
    rates: [{ effective_from: '2026-07-16', amount: 3_100_000, rate_unit: 'monthly' }],
  })
  const endedMidMonth = monthlyProfile({
    joined_at: '2026-07-01',
    ended_at: '2026-07-20',
    is_active: false,
    rates: [{ effective_from: '2026-07-01', amount: 3_100_000, rate_unit: 'monthly' }],
  })
  const twoAbsences = monthlyProfile({
    joined_at: '2026-07-01',
    rates: [{ effective_from: '2026-07-01', amount: 3_100_000, rate_unit: 'monthly' }],
    absences: [
      { absence_date: '2026-07-10' },
      { absence_date: '2026-07-31' },
    ],
  })

  assert.equal(salaryTotal(joinedMidMonth, '2026-07-01', '2026-07-31'), 1_600_000)
  assert.equal(salaryTotal(endedMidMonth, '2026-07-01', '2026-07-31'), 2_000_000)
  assert.equal(salaryTotal(twoAbsences, '2026-07-01', '2026-07-31'), 2_900_000)
})

test('effective-dated monthly rate changes use each rate calendar-day share', () => {
  const profile = monthlyProfile({
    joined_at: '2026-06-01',
    rates: [
      { effective_from: '2026-06-01', amount: 3_000_000, rate_unit: 'monthly' },
      { effective_from: '2026-06-16', amount: 6_000_000, rate_unit: 'monthly' },
    ],
  })

  const rows = buildSalaryExpenseRows([profile], '2026-06-01', '2026-06-30')
  assert.deepEqual(rows.slice(0, 15).map(row => row.amount), Array(15).fill(100_000))
  assert.deepEqual(rows.slice(15).map(row => row.amount), Array(15).fill(200_000))
  assert.equal(summarizeExpenses(rows).total, 4_500_000)
  assert.equal(getMonthlySalaryCommitment(profile, '2026-06-20'), 4_500_000)
})

test('salary due accumulates exact monthly amounts across February and leap February', () => {
  const nonLeapProfile = monthlyProfile({
    joined_at: '2026-01-01',
    rates: [{ effective_from: '2026-01-01', amount: 3_000_000, rate_unit: 'monthly' }],
    payments: [{ paid_date: '2026-01-31', amount: 2_000_000 }],
  })
  const leapProfile = monthlyProfile({
    joined_at: '2028-01-01',
    rates: [{ effective_from: '2028-01-01', amount: 3_000_000, rate_unit: 'monthly' }],
    payments: [{ paid_date: '2028-01-31', amount: 3_000_000 }],
  })

  assert.equal(getSalaryDue(nonLeapProfile, '2026-02-28'), 4_000_000)
  assert.equal(getSalaryDue(leapProfile, '2028-02-29'), 3_000_000)
})

test('monthly commitment and estimate reconcile for joins absences and rate changes', () => {
  const profile = monthlyProfile({
    joined_at: '2026-06-06',
    rates: [
      { effective_from: '2026-06-06', amount: 3_000_000, rate_unit: 'monthly' },
      { effective_from: '2026-06-21', amount: 6_000_000, rate_unit: 'monthly' },
    ],
    absences: [{ absence_date: '2026-06-10' }],
  })
  const summary = getEstimatedMonthlyExpenseSummary([profile], '2026-06-15')

  // 14 paid days at 100k plus 10 days at 200k.
  assert.equal(getMonthlySalaryCommitment(profile, '2026-06-15'), 3_400_000)
  assert.equal(summary.employeeProjectedMonth, 3_400_000)
  assert.equal(summary.employeeAppliedToCurrentMonth, 0)
  assert.equal(summary.employeeRemainingThisMonth, 3_400_000)
})

test('current-month payments settle each employee opening arrears before current salary', () => {
  const arrearsProfile = monthlyProfile({
    id: 'employee-with-arrears',
    joined_at: '2026-06-01',
    rates: [
      { effective_from: '2026-06-01', amount: 3_000_000, rate_unit: 'monthly' },
      { effective_from: '2026-07-01', amount: 3_100_000, rate_unit: 'monthly' },
    ],
    payments: [{ paid_date: '2026-07-10', amount: 2_000_000 }],
  })
  const currentProfile = monthlyProfile({
    id: 'employee-without-arrears',
    joined_at: '2026-07-01',
    rates: [{ effective_from: '2026-07-01', amount: 3_100_000, rate_unit: 'monthly' }],
    payments: [{ paid_date: '2026-07-10', amount: 1_000_000 }],
  })

  const summary = getEstimatedMonthlyExpenseSummary([arrearsProfile, currentProfile], '2026-07-15')

  assert.equal(summary.employeePaidToDate, 3_000_000, 'actual July cash payments remain visible')
  assert.equal(summary.employeeProjectedMonth, 6_200_000)
  assert.equal(summary.employeeOpeningArrears, 3_000_000)
  assert.equal(summary.employeePaidTowardArrears, 2_000_000)
  assert.equal(summary.employeeAppliedToCurrentMonth, 1_000_000)
  assert.equal(summary.employeeRemainingThisMonth, 5_200_000)
})

test('payments that exceed opening arrears reduce only the remaining current-month salary', () => {
  const profile = monthlyProfile({
    joined_at: '2026-06-01',
    rates: [
      { effective_from: '2026-06-01', amount: 3_000_000, rate_unit: 'monthly' },
      { effective_from: '2026-07-01', amount: 3_100_000, rate_unit: 'monthly' },
    ],
    payments: [
      { paid_date: '2026-06-30', amount: 1_000_000 },
      { paid_date: '2026-07-20', amount: 3_000_000 },
    ],
  })

  const summary = getEstimatedMonthlyExpenseSummary([profile], '2026-07-20')

  assert.equal(summary.employeeOpeningArrears, 2_000_000)
  assert.equal(summary.employeePaidToDate, 3_000_000)
  assert.equal(summary.employeePaidTowardArrears, 2_000_000)
  assert.equal(summary.employeeAppliedToCurrentMonth, 1_000_000)
  assert.equal(summary.employeeRemainingThisMonth, 2_100_000)
  assert.equal(getSalaryDue(profile, '2026-07-20'), 1_000_000)
})
