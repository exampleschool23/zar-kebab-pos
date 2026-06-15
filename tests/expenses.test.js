import test from 'node:test'
import assert from 'node:assert/strict'

import {
  expenseCategoryLabel,
  expenseMatchesRange,
  expensePaymentMethodLabel,
  getNetIncome,
  normalizeExpenseAmount,
  summarizeExpenses,
} from '../src/lib/expenses.js'

test('expense summary totals category and payment method spending', () => {
  const summary = summarizeExpenses([
    { category: 'salary_cook', payment_method: 'cash', amount: 1_200_000 },
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
  ]), 1_350_000)
})

test('expense helpers normalize values and labels for accountant entry', () => {
  assert.equal(normalizeExpenseAmount('12000.7'), 12001)
  assert.equal(normalizeExpenseAmount('-5000'), 0)
  assert.equal(expenseCategoryLabel('salary_manager', 'ru'), 'Зарплата менеджера')
  assert.equal(expensePaymentMethodLabel('terminal', 'uz'), 'Terminal')
  assert.equal(expenseMatchesRange({ expense_date: '2026-06-15' }, '2026-06-01', '2026-06-30'), true)
  assert.equal(expenseMatchesRange({ expense_date: '2026-07-01' }, '2026-06-01', '2026-06-30'), false)
})

