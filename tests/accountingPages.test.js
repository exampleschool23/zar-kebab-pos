import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collapseDailyBazaarExpenseRows,
  filterAccountingHistoryRows,
  getAccountingHistoryDeleteTarget,
  getAccountingExpenseBreakdown,
  getAccountingHistoryPageSummary,
  getAccountingPageSummary,
  getAccountingQuickRange,
  groupAccountingHistoryRows,
} from '../src/lib/accounting.js'

function paidOrder(id, date, total, paymentMethod = 'cash', overrides = {}) {
  return {
    id,
    payment_status: 'paid',
    status: 'paid',
    paid_at: `${date}T12:00:00+05:00`,
    payment_method: paymentMethod,
    service_rate_pct: 0,
    total,
    items: [],
    ...overrides,
  }
}

test('Accounting quick ranges cover today, seven days, month, previous month, and year rollover', () => {
  assert.deepEqual(getAccountingQuickRange('today', '2026-07-14'), {
    dateFrom: '2026-07-14',
    dateTo: '2026-07-14',
  })
  assert.deepEqual(getAccountingQuickRange('week', '2026-07-14'), {
    dateFrom: '2026-07-08',
    dateTo: '2026-07-14',
  })
  assert.deepEqual(getAccountingQuickRange('month', '2026-07-14'), {
    dateFrom: '2026-07-01',
    dateTo: '2026-07-14',
  })
  assert.deepEqual(getAccountingQuickRange('previousMonth', '2026-01-10'), {
    dateFrom: '2025-12-01',
    dateTo: '2025-12-31',
  })
  assert.deepEqual(getAccountingQuickRange('previousMonth', '2024-03-01'), {
    dateFrom: '2024-02-01',
    dateTo: '2024-02-29',
  })
})

test('Accounting page composes cafe income, daily average, external income, expenses, net income, and cashflow', () => {
  const orders = [
    paidOrder('paid-cash', '2026-07-10', 1_000, 'cash', {
      items: [{ menu_item_id: 'kebab', quantity: 1, price: 1_000, cost_price: 300, status: 'served' }],
    }),
    paidOrder('paid-card', '2026-07-11', 500, 'card', {
      items: [{ menu_item_id: 'tea', quantity: 1, price: 500, cost_price: 100, status: 'served' }],
    }),
    paidOrder('outside', '2026-06-30', 9_000, 'cash'),
    paidOrder('unpaid', '2026-07-10', 7_000, 'cash', { payment_status: 'unpaid', status: 'needs_bill', paid_at: null, created_at: '2026-07-10T12:00:00+05:00' }),
  ]
  const entries = [
    { id: 'bazaar', expense_date: '2026-07-10', category: 'products_bazaar', payment_method: 'cash', amount: 400 },
    { id: 'salary', expense_date: '2026-07-11', category: 'salary_waiter', payment_method: 'card', amount: 200, is_salary_payment: true },
    { id: 'bonus', expense_date: '2026-07-11', category: 'salary_other', payment_method: 'terminal', amount: 50, is_salary_bonus: true },
    { id: 'investor', entry_type: 'income', expense_date: '2026-07-10', category: 'investor_support', payment_method: 'cash', amount: 800 },
    { id: 'other-income', entry_type: 'income', expense_date: '2026-07-11', category: 'other_income', payment_method: 'terminal', amount: 100 },
    { id: 'outside-expense', expense_date: '2026-06-30', category: 'other', payment_method: 'cash', amount: 10_000 },
  ]

  const summary = getAccountingPageSummary(orders, entries, '2026-07-01', '2026-07-14')

  assert.equal(summary.cafeIncome, 1_500)
  assert.equal(summary.netProfit, 1_100)
  assert.equal(summary.cafeIncomeSummary.dayCount, 14)
  assert.equal(summary.cafeIncomeSummary.salesDayCount, 2)
  assert.equal(summary.cafeIncomeSummary.averageDaily, 107)
  assert.equal(summary.expenseSummary.total, 650)
  assert.equal(summary.expenseSummary.count, 3)
  assert.equal(summary.salaryExpensesTotal, 250)
  assert.equal(summary.productBazaarExpensesTotal, 400)
  assert.equal(summary.otherExpensesTotal, 0)
  assert.equal(summary.incomeSummary.total, 900)
  assert.equal(summary.investorSupportTotal, 800)
  assert.equal(summary.otherIncomeTotal, 100)
  assert.equal(summary.netIncome, 1_750)
  assert.equal(summary.cashflow.byMethod.cash.left, 1_400)
  assert.equal(summary.cashflow.byMethod.card.left, 300)
  assert.equal(summary.cashflow.byMethod.terminal.left, 50)
})

test('Accounting page totals and average change with the selected date range', () => {
  const orders = [
    paidOrder('first-day', '2026-07-10', 1_000),
    paidOrder('second-day', '2026-07-11', 500),
  ]
  const entries = [
    { expense_date: '2026-07-10', category: 'products_bazaar', payment_method: 'cash', amount: 400 },
    { expense_date: '2026-07-11', category: 'other', payment_method: 'cash', amount: 200 },
    { entry_type: 'income', expense_date: '2026-07-10', category: 'investor_support', payment_method: 'cash', amount: 800 },
  ]

  const oneDay = getAccountingPageSummary(orders, entries, '2026-07-10', '2026-07-10')
  const twoDays = getAccountingPageSummary(orders, entries, '2026-07-10', '2026-07-11')

  assert.deepEqual(
    [oneDay.cafeIncome, oneDay.cafeIncomeSummary.averageDaily, oneDay.expenseSummary.total, oneDay.netIncome],
    [1_000, 1_000, 400, 1_400]
  )
  assert.deepEqual(
    [twoDays.cafeIncome, twoDays.cafeIncomeSummary.averageDaily, twoDays.expenseSummary.total, twoDays.netIncome],
    [1_500, 750, 600, 1_700]
  )
})

test('All Accounting filters by entry type and localized searchable fields', () => {
  const rows = [
    { id: 'bazaar', expense_date: '2026-07-12', category: 'products_bazaar', payment_method: 'cash', vendor: 'Mavtuna', description: 'Tomatoes' },
    { id: 'salary', expense_date: '2026-07-12', category: 'salary_waiter', payment_method: 'card', vendor: 'Nodir', description: 'Salary payment' },
    { id: 'investor', entry_type: 'income', expense_date: '2026-07-12', category: 'investor_support', payment_method: 'terminal', vendor: 'Founder' },
  ]

  assert.deepEqual(filterAccountingHistoryRows(rows, { type: 'income' }).map(row => row.id), ['investor'])
  assert.deepEqual(filterAccountingHistoryRows(rows, { query: 'mavTUNA' }).map(row => row.id), ['bazaar'])
  assert.deepEqual(filterAccountingHistoryRows(rows, { query: 'Продукты', lang: 'ru' }).map(row => row.id), ['bazaar'])
  assert.deepEqual(filterAccountingHistoryRows(rows, { query: 'terminal', lang: 'en' }).map(row => row.id), ['investor'])
  assert.deepEqual(filterAccountingHistoryRows(rows, { query: 'salary payment' }).map(row => row.id), ['salary'])
})

test('All Accounting removal targets the underlying financial record', () => {
  assert.deepEqual(
    getAccountingHistoryDeleteTarget({ id: 'expense-1', category: 'products_bazaar' }),
    { table: 'expenses', id: 'expense-1' }
  )
  assert.deepEqual(
    getAccountingHistoryDeleteTarget({ id: 'salary-payment-payment-1', source_id: 'payment-1', is_salary_payment: true }),
    { table: 'employee_salary_payments', id: 'payment-1' }
  )
  assert.deepEqual(
    getAccountingHistoryDeleteTarget({ id: 'salary-bonus-bonus-1', source_id: 'bonus-1', is_salary_bonus: true }),
    { table: 'employee_salary_bonuses', id: 'bonus-1' }
  )
  assert.equal(getAccountingHistoryDeleteTarget(null), null)
  assert.equal(getAccountingHistoryDeleteTarget({ id: 'bazaar-day:2026-07-12', is_bazaar_daily_total: true }), null)
})

test('Accounting presents one Bazaar total per day without changing ledger rows', () => {
  const rows = [
    { id: 'morning', expense_date: '2026-07-12', category: 'products_bazaar', payment_method: 'cash', amount: 200, created_at: '2026-07-12T08:00:00Z' },
    { id: 'evening', expense_date: '2026-07-12', category: 'products_bazaar', payment_method: 'card', amount: 350, created_at: '2026-07-12T18:00:00Z' },
    { id: 'next-day', expense_date: '2026-07-11', category: 'products_bazaar', payment_method: 'cash', amount: 100 },
    { id: 'rent', expense_date: '2026-07-12', category: 'rent', payment_method: 'card', amount: 1_000 },
  ]

  const displayRows = collapseDailyBazaarExpenseRows(rows)
  const dayTotal = displayRows.find(row => row.id === 'bazaar-day:2026-07-12')

  assert.equal(rows.length, 4)
  assert.equal(displayRows.length, 3)
  assert.equal(dayTotal.amount, 550)
  assert.equal(dayTotal.payment_method, 'mixed')
  assert.equal(dayTotal.entry_count, 2)
  assert.deepEqual(dayTotal.source_ids, ['morning', 'evening'])
  assert.equal(dayTotal.created_at, '2026-07-12T18:00:00Z')
  assert.equal(dayTotal.is_bazaar_daily_total, true)
})

test('All Accounting daily headers keep full-day cafe, expense, and investor totals when rows are filtered', () => {
  const allRows = [
    { id: 'bazaar', expense_date: '2026-07-12', category: 'products_bazaar', payment_method: 'cash', amount: 500 },
    { id: 'salary', expense_date: '2026-07-12', category: 'salary_waiter', payment_method: 'cash', amount: 200, is_salary_payment: true },
    { id: 'investor', entry_type: 'income', expense_date: '2026-07-12', category: 'investor_support', payment_method: 'cash', amount: 300 },
    { id: 'other-income', entry_type: 'income', expense_date: '2026-07-12', category: 'other_income', payment_method: 'cash', amount: 100 },
    { id: 'next-day', expense_date: '2026-07-11', category: 'other', payment_method: 'cash', amount: 40 },
  ]
  const visibleRows = [allRows[0], allRows[4]]
  const orders = [
    paidOrder('day-12', '2026-07-12', 900),
    paidOrder('day-12-unpaid', '2026-07-12', 5_000, 'cash', { payment_status: 'unpaid', status: 'needs_bill', paid_at: null, created_at: '2026-07-12T12:00:00+05:00' }),
    paidOrder('day-11', '2026-07-11', 200),
  ]

  const groups = groupAccountingHistoryRows(visibleRows, allRows, orders)

  assert.deepEqual(groups.map(group => group.date), ['2026-07-12', '2026-07-11'])
  assert.deepEqual(groups.map(group => group.rows.map(row => row.id)), [['bazaar'], ['next-day']])
  assert.deepEqual(
    groups.map(group => [group.totalExpenses, group.cafeIncome, group.investorIncome]),
    [[700, 900, 300], [40, 200, 0]]
  )
})

test('All Accounting top cards separate cafe, salary, bazaar, other expense, and investor totals', () => {
  const rows = [
    { expense_date: '2026-07-12', category: 'products_bazaar', amount: 500 },
    { expense_date: '2026-07-12', category: 'salary_waiter', amount: 200, is_salary_payment: true },
    { expense_date: '2026-07-12', category: 'other', amount: 75 },
    { entry_type: 'income', expense_date: '2026-07-12', category: 'investor_support', amount: 300 },
    { entry_type: 'income', expense_date: '2026-07-12', category: 'other_income', amount: 9_000 },
  ]
  const orders = [paidOrder('cafe', '2026-07-12', 900)]

  const summary = getAccountingHistoryPageSummary(rows, orders, '2026-07-01', '2026-07-14')

  assert.equal(summary.cafeIncomeSummary.total, 900)
  assert.equal(summary.expenseSummary.total, 775)
  assert.equal(summary.salaryExpensesTotal, 200)
  assert.equal(summary.productBazaarExpensesTotal, 500)
  assert.equal(summary.otherExpensesTotal, 75)
  assert.equal(summary.investorSupportTotal, 300)
  assert.equal(summary.incomeSummary.total, 9_300)
})

test('All Accounting salary breakdown includes payments bonuses and legacy salary categories only', () => {
  const summary = getAccountingExpenseBreakdown([
    { category: 'salary_waiter', amount: 200 },
    { category: 'other', amount: 50, is_salary_bonus: true },
    { category: 'products_bazaar', amount: 500 },
    { category: 'other', amount: 100 },
    { entry_type: 'income', category: 'investor_support', amount: 10_000 },
  ])

  assert.deepEqual(summary, {
    salaryExpensesTotal: 250,
    productBazaarExpensesTotal: 500,
    otherExpensesTotal: 100,
  })
})
