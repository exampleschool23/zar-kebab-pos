import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSalaryBonusExpenseRows,
  buildSalaryExpenseRows,
  buildSalaryPaymentExpenseRows,
  convertSalaryAmountToDaily,
  expenseCategoryLabel,
  expenseMatchesRange,
  expensePaymentMethodLabel,
  getDailySalaryAmount,
  getNetIncome,
  getSalaryActiveUntil,
  getSalaryDue,
  getSalaryCategoryForRole,
  getTotalSalaryDue,
  normalizeExpenseAmount,
  summarizeIncomeEntries,
  summarizeExpenseCashflow,
  summarizeExpenses,
} from '../src/lib/expenses.js'

test('expense summary totals category and payment method spending', () => {
  const summary = summarizeExpenses([
    { category: 'salary_cook', payment_method: 'cash', amount: 1_200_000 },
    { entry_type: 'income', category: 'investor_support', payment_method: 'cash', amount: 900_000 },
    { category: 'products_bazaar', payment_method: 'terminal', amount: 450_000 },
    { category: 'products_bazaar', payment_method: 'card', amount: 150_000 },
    { category: 'equipment', payment_method: 'cash', amount: 0 },
  ])

  assert.equal(summary.total, 1_800_000)
  assert.equal(summary.count, 3)
  assert.equal(summary.byCategory.salary_cook, 1_200_000)
  assert.equal(summary.byCategory.products_bazaar, 600_000)
  assert.equal(summary.byMethod.cash, 1_200_000)
  assert.equal(summary.byMethod.terminal, 450_000)
  assert.equal(summary.byMethod.card, 150_000)
})

test('net income subtracts expenses from cafe revenue', () => {
  assert.equal(getNetIncome(2_700_000, [
    { category: 'salary_waiter', payment_method: 'cash', amount: 400_000 },
    { category: 'products_bazaar', payment_method: 'terminal', amount: 950_000 },
    { entry_type: 'income', category: 'investor_support', payment_method: 'cash', amount: 500_000 },
  ]), 1_850_000)
})

test('expense cashflow shows what is left in cash card and terminal', () => {
  const cashflow = summarizeExpenseCashflow([
    { payment_status: 'paid', payment_method: 'cash', total: 1_000_000 },
    {
      payment_status: 'paid',
      payment_method: 'mixed',
      total: 600_000,
      payments: [
        { method: 'card', amount: 250_000 },
        { method: 'terminal', amount: 350_000 },
      ],
    },
  ], [
    { payment_method: 'cash', amount: 300_000 },
    { payment_method: 'card', amount: 100_000 },
    { payment_method: 'terminal', amount: 400_000 },
    { entry_type: 'income', payment_method: 'cash', amount: 200_000 },
  ])

  assert.equal(cashflow.byMethod.cash.income, 1_200_000)
  assert.equal(cashflow.byMethod.cash.expenses, 300_000)
  assert.equal(cashflow.byMethod.cash.left, 900_000)
  assert.equal(cashflow.byMethod.card.left, 150_000)
  assert.equal(cashflow.byMethod.terminal.left, -50_000)
  assert.deepEqual(cashflow.rows.map(row => row.method), ['cash', 'card', 'terminal'])
})

test('income summary tracks investor support separately from cafe sales', () => {
  const summary = summarizeIncomeEntries([
    { entry_type: 'income', category: 'investor_support', payment_method: 'cash', amount: 2_000_000 },
    { entry_type: 'income', category: 'other_income', payment_method: 'card', amount: 500_000 },
    { entry_type: 'expense', category: 'rent', payment_method: 'cash', amount: 800_000 },
  ])

  assert.equal(summary.total, 2_500_000)
  assert.equal(summary.count, 2)
  assert.equal(summary.byCategory.investor_support, 2_000_000)
  assert.equal(summary.byMethod.cash, 2_000_000)
  assert.equal(summary.byMethod.card, 500_000)
})

test('expense helpers normalize values and labels for accountant entry', () => {
  assert.equal(normalizeExpenseAmount('12000.7'), 12001)
  assert.equal(normalizeExpenseAmount('-5000'), 0)
  assert.equal(normalizeExpenseAmount('1 000 000'), 1_000_000)
  assert.equal(convertSalaryAmountToDaily(8_000_000, 'monthly'), 266_667)
  assert.equal(convertSalaryAmountToDaily(350_000, 'daily'), 350_000)
  assert.equal(expenseCategoryLabel('salary_manager', 'ru'), 'Зарплата менеджера')
  assert.equal(expensePaymentMethodLabel('terminal', 'uz'), 'Terminal')
  assert.equal(expenseMatchesRange({ expense_date: '2026-06-15' }, '2026-06-01', '2026-06-30'), true)
  assert.equal(expenseMatchesRange({ expense_date: '2026-07-01' }, '2026-06-01', '2026-06-30'), false)
})

test('employee salary ledger generates effective-dated daily expense rows and due balance', () => {
  const waiterProfile = {
    id: 'salary-waiter-1',
    profile_id: 'waiter-1',
    employee_name: 'Ali Waiter',
    joined_at: '2026-06-15',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [
      { effective_from: '2026-06-15', amount: 8_100_000, rate_unit: 'monthly', created_at: '2026-06-15T08:00:00Z' },
      { effective_from: '2026-06-16', amount: 350_000, rate_unit: 'daily', created_at: '2026-06-16T08:00:00Z' },
    ],
    payments: [
      { paid_date: '2026-06-16', amount: 270_000 },
    ],
  }

  const salaryRows = buildSalaryExpenseRows([
    waiterProfile,
    {
      id: 'salary-cashier-1',
      profile_id: 'cashier-1',
      employee_name: 'Cashier',
      joined_at: '2026-06-16',
      payment_method: 'terminal',
      profile: { role: 'cashier' },
      rates: [{ effective_from: '2026-06-16', amount: 350_000, rate_unit: 'daily' }],
      payments: [],
    },
  ], '2026-06-14', '2026-06-16')

  assert.equal(getDailySalaryAmount(waiterProfile, '2026-06-15'), 270_000)
  assert.equal(getDailySalaryAmount(waiterProfile, '2026-06-16'), 350_000)
  assert.equal(getSalaryDue(waiterProfile, '2026-06-16'), 350_000)
  assert.equal(getSalaryCategoryForRole('waiter'), 'salary_waiter')
  assert.equal(getSalaryCategoryForRole('cashier'), 'salary_manager')
  assert.deepEqual(salaryRows.map(row => row.expense_date), ['2026-06-15', '2026-06-16', '2026-06-16'])
  assert.equal(salaryRows[0].amount, 270_000)
  assert.equal(salaryRows[1].amount, 350_000)
  assert.equal(salaryRows[2].payment_method, 'terminal')

  const summary = summarizeExpenses(salaryRows)
  assert.equal(summary.total, 970_000)
  assert.equal(summary.byCategory.salary_waiter, 620_000)
  assert.equal(summary.byCategory.salary_manager, 350_000)
})

test('deactivated salary profiles stop accruing after ended_at while keeping due history', () => {
  const formerWaiter = {
    id: 'salary-former-1',
    profile_id: 'waiter-2',
    employee_name: 'Former Waiter',
    joined_at: '2026-06-01',
    ended_at: '2026-06-10',
    is_active: false,
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [{ paid_date: '2026-06-05', amount: 900_000 }],
  }

  const rows = buildSalaryExpenseRows([formerWaiter], '2026-06-01', '2026-06-16')

  assert.equal(getSalaryActiveUntil(formerWaiter, '2026-06-16'), '2026-06-10')
  assert.equal(rows.length, 10)
  assert.equal(rows.at(-1).expense_date, '2026-06-10')
  assert.equal(getSalaryDue(formerWaiter, '2026-06-16'), 2_100_000)
  assert.equal(getTotalSalaryDue([formerWaiter], '2026-06-16'), 2_100_000)
})

test('salary bonuses create separate expense rows without changing salary due', () => {
  const waiterProfile = {
    id: 'salary-bonus-1',
    profile_id: 'waiter-3',
    employee_name: 'Bonus Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [],
    bonuses: [
      { id: 'bonus-1', bonus_date: '2026-06-16', amount: 500_000, payment_method: 'card', note: 'Great service' },
    ],
  }

  const bonusRows = buildSalaryBonusExpenseRows([waiterProfile], '2026-06-01', '2026-06-16')

  assert.equal(bonusRows.length, 1)
  assert.equal(bonusRows[0].amount, 500_000)
  assert.equal(bonusRows[0].payment_method, 'card')
  assert.equal(getSalaryDue(waiterProfile, '2026-06-16'), 4_800_000)
})

test('salary expense history uses recorded salary payments, not daily accrual rows', () => {
  const waiterProfile = {
    id: 'salary-payment-1',
    profile_id: 'waiter-4',
    employee_name: 'Paid Waiter',
    joined_at: '2026-06-01',
    payment_method: 'cash',
    profile: { role: 'waiter' },
    rates: [{ effective_from: '2026-06-01', amount: 300_000, rate_unit: 'daily' }],
    payments: [
      { id: 'payment-1', paid_date: '2026-06-16', amount: 900_000, payment_method: 'card', note: 'Week payout' },
    ],
  }

  const paymentRows = buildSalaryPaymentExpenseRows([waiterProfile], '2026-06-01', '2026-06-16')
  const accrualRows = buildSalaryExpenseRows([waiterProfile], '2026-06-01', '2026-06-16')

  assert.equal(paymentRows.length, 1)
  assert.equal(paymentRows[0].amount, 900_000)
  assert.equal(paymentRows[0].payment_method, 'card')
  assert.equal(accrualRows.length, 16)
})
