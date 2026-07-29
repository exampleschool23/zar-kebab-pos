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
import { getOrdersNetProfit, getSaleProfitSummary } from './profit.js'

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

export function getAccountingPageSummary(orders = [], entries = [], dateFrom, dateTo, menuItemMap = null) {
  const rangeEntries = (entries || []).filter(entry => expenseMatchesRange(entry, dateFrom, dateTo))
  const paidOrders = groupOrdersBySession(orders || [])
    .filter(order => isPaidOrder(order) && matchesRange(order, dateFrom, dateTo))
  const cafeIncomeSummary = getCafeIncomeForRange(orders, dateFrom, dateTo)
  const expenseSummary = summarizeExpenses(rangeEntries)
  const expenseBreakdown = getAccountingExpenseBreakdown(rangeEntries)
  const incomeSummary = summarizeIncomeEntries(rangeEntries)
  const investorSupportTotal = incomeSummary.byCategory.investor_support || 0
  const netProfit = getOrdersNetProfit(paidOrders, menuItemMap)
  const profitMarginPct = getSaleProfitSummary(
    cafeIncomeSummary.total,
    cafeIncomeSummary.total - netProfit
  )?.marginPct ?? null

  return {
    paidOrders,
    cafeIncome: cafeIncomeSummary.total,
    loyaltyIncome: cafeIncomeSummary.loyaltyTotal,
    netProfit,
    profitMarginPct,
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
  const productBazaarRows = expenseRows.filter(row => !isSalaryRow(row) && row?.category === 'products_bazaar')
  const otherRows = expenseRows.filter(row => !isSalaryRow(row) && row?.category !== 'products_bazaar')
  return {
    salaryExpensesTotal: summarizeExpenses(salaryRows).total,
    productBazaarExpensesTotal: summarizeExpenses(productBazaarRows).total,
    otherExpensesTotal: summarizeExpenses(otherRows).total,
  }
}

// Accounting keeps every linked Bazaar expense for auditability, but presents
// one concise Bazaar total per calendar day. Daily Bazaar remains the place for
// individual purchases and product lines.
export function collapseDailyBazaarExpenseRows(rows = []) {
  const otherRows = []
  const bazaarByDate = new Map()

  for (const row of rows || []) {
    const isBazaarExpense = (
      normalizeExpenseEntryType(row?.entry_type) === 'expense'
      && row?.category === 'products_bazaar'
    )
    if (!isBazaarExpense) {
      otherRows.push(row)
      continue
    }

    const date = row?.expense_date || ''
    const aggregate = bazaarByDate.get(date) || {
      ...row,
      id: `bazaar-day:${date}`,
      amount: 0,
      vendor: '',
      description: '',
      created_by_name: '',
      source_ids: [],
      entry_count: 0,
      is_bazaar_daily_total: true,
      _paymentMethods: new Set(),
    }

    aggregate.amount += Math.max(0, Number(row?.amount) || 0)
    aggregate.entry_count += 1
    if (row?.id) aggregate.source_ids.push(row.id)
    if (row?.payment_method) aggregate._paymentMethods.add(row.payment_method)
    if (String(row?.created_at || '') > String(aggregate.created_at || '')) {
      aggregate.created_at = row.created_at
    }
    bazaarByDate.set(date, aggregate)
  }

  const bazaarRows = [...bazaarByDate.values()].map(row => {
    const paymentMethods = [...row._paymentMethods]
    const { _paymentMethods, ...aggregate } = row
    return {
      ...aggregate,
      payment_method: paymentMethods.length === 1 ? paymentMethods[0] : 'mixed',
    }
  })

  return [...otherRows, ...bazaarRows].sort((a, b) => (
    String(b?.expense_date || '').localeCompare(String(a?.expense_date || ''))
    || String(b?.created_at || '').localeCompare(String(a?.created_at || ''))
    || String(a?.id || '').localeCompare(String(b?.id || ''))
  ))
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

export function getAccountingHistoryDeleteTarget(row) {
  if (!row?.id) return null
  if (row.is_bazaar_daily_total) return null
  if (row.is_salary_payment) {
    const id = row.source_id || String(row.id).replace(/^salary-payment-/, '')
    return id ? { table: 'employee_salary_payments', id } : null
  }
  if (row.is_salary_bonus) {
    const id = row.source_id || String(row.id).replace(/^salary-bonus-/, '')
    return id ? { table: 'employee_salary_bonuses', id } : null
  }
  return { table: 'expenses', id: row.id }
}

export function getAccountingHistoryPageSummary(rows = [], orders = [], dateFrom, dateTo) {
  const incomeSummary = summarizeIncomeEntries(rows)
  return {
    expenseSummary: summarizeExpenses(rows),
    ...getAccountingExpenseBreakdown(rows),
    incomeSummary,
    investorSupportTotal: incomeSummary.byCategory.investor_support || 0,
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
    const cafeIncomeSummary = getCafeIncomeForRange(orders, group.date, group.date)
    return {
      ...group,
      totalExpenses: summarizeExpenses(dayRows).total,
      cafeIncome: cafeIncomeSummary.total,
      loyaltyIncome: cafeIncomeSummary.loyaltyTotal,
      investorIncome: dayRows
        .filter(row => normalizeExpenseEntryType(row?.entry_type) === 'income' && row?.category === 'investor_support')
        .reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    }
  })
}
