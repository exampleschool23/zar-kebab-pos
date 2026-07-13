import {
  getCafeIncomeForRange,
  groupOrdersBySession,
  isPaidOrder,
  matchesRange,
} from './analytics.js'
import {
  expenseCategoryLabel,
  expenseMatchesRange,
  expensePaymentMethodLabel,
  normalizeExpenseEntryType,
  summarizeExpenseCashflow,
  summarizeExpenses,
  summarizeIncomeEntries,
  todayExpenseDate,
} from './expenses.js'

function normalizeIsoDate(value, fallback = todayExpenseDate()) {
  const date = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback
}

function shiftIsoDate(value, days) {
  const [year, month, day] = normalizeIsoDate(value).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

export function getAccountingQuickRange(key = 'month', today = todayExpenseDate()) {
  const normalizedToday = normalizeIsoDate(today)
  if (key === 'today') return { dateFrom: normalizedToday, dateTo: normalizedToday }
  if (key === 'week') return { dateFrom: shiftIsoDate(normalizedToday, -6), dateTo: normalizedToday }
  if (key === 'previousMonth') {
    const previousMonthEnd = shiftIsoDate(`${normalizedToday.slice(0, 8)}01`, -1)
    return { dateFrom: `${previousMonthEnd.slice(0, 8)}01`, dateTo: previousMonthEnd }
  }
  return { dateFrom: `${normalizedToday.slice(0, 8)}01`, dateTo: normalizedToday }
}

export function getAccountingPageSummary(orders = [], entries = [], dateFrom, dateTo) {
  const rangeEntries = (entries || []).filter(entry => expenseMatchesRange(entry, dateFrom, dateTo))
  const paidOrders = groupOrdersBySession(orders || [])
    .filter(order => isPaidOrder(order) && matchesRange(order, dateFrom, dateTo))
  const cafeIncomeSummary = getCafeIncomeForRange(orders, dateFrom, dateTo)
  const expenseSummary = summarizeExpenses(rangeEntries)
  const expenseBreakdown = getAccountingExpenseBreakdown(rangeEntries)
  const incomeSummary = summarizeIncomeEntries(rangeEntries)
  const investorSupportTotal = incomeSummary.byCategory.investor_support || 0

  return {
    paidOrders,
    cafeIncome: cafeIncomeSummary.total,
    cafeIncomeSummary,
    expenseSummary,
    ...expenseBreakdown,
    incomeSummary,
    investorSupportTotal,
    otherIncomeTotal: Math.max(0, incomeSummary.total - investorSupportTotal),
    netIncome: cafeIncomeSummary.total + incomeSummary.total - expenseSummary.total,
    cashflow: summarizeExpenseCashflow(paidOrders, rangeEntries),
  }
}

export function getAccountingExpenseBreakdown(rows = []) {
  const expenseRows = (rows || []).filter(row => normalizeExpenseEntryType(row?.entry_type) === 'expense')
  const isSalaryRow = row => (
    row?.is_salary_payment ||
    row?.is_salary_bonus ||
    row?.is_salary_auto ||
    String(row?.category || '').startsWith('salary_')
  )
  const salaryRows = expenseRows.filter(isSalaryRow)
  const otherRows = expenseRows.filter(row => !isSalaryRow(row))
  return {
    salaryExpensesTotal: summarizeExpenses(salaryRows).total,
    otherExpensesTotal: summarizeExpenses(otherRows).total,
  }
}

export function filterAccountingHistoryRows(rows = [], { type = 'all', query = '', lang = 'en' } = {}) {
  const needle = String(query || '').trim().toLowerCase()
  return (rows || []).filter(row => {
    const entryType = normalizeExpenseEntryType(row?.entry_type)
    if (type !== 'all' && entryType !== type) return false
    if (!needle) return true
    return [
      row?.vendor,
      row?.description,
      row?.created_by_name,
      expenseCategoryLabel(row?.category, lang),
      expensePaymentMethodLabel(row?.payment_method, lang),
    ].some(value => String(value || '').toLowerCase().includes(needle))
  })
}

export function getAccountingHistoryPageSummary(rows = [], orders = [], dateFrom, dateTo) {
  return {
    expenseSummary: summarizeExpenses(rows),
    ...getAccountingExpenseBreakdown(rows),
    incomeSummary: summarizeIncomeEntries(rows),
    cafeIncomeSummary: getCafeIncomeForRange(orders, dateFrom, dateTo),
  }
}

export function groupAccountingHistoryRows(visibleRows = [], allRows = [], orders = []) {
  const groups = []
  for (const row of visibleRows || []) {
    const date = row?.expense_date || ''
    const current = groups[groups.length - 1]
    if (!current || current.date !== date) groups.push({ date, rows: [row] })
    else current.rows.push(row)
  }

  return groups.map(group => {
    const dayRows = (allRows || []).filter(row => row?.expense_date === group.date)
    return {
      ...group,
      totalExpenses: summarizeExpenses(dayRows).total,
      cafeIncome: getCafeIncomeForRange(orders, group.date, group.date).total,
      investorIncome: dayRows
        .filter(row => normalizeExpenseEntryType(row?.entry_type) === 'income' && row?.category === 'investor_support')
        .reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    }
  })
}
