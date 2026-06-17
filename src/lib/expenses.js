import { getOrderPayments, toLocalDateStr } from './analytics.js'

export const EXPENSE_PAYMENT_METHODS = ['cash', 'card', 'terminal']
export const EXPENSE_ENTRY_TYPES = ['expense', 'income']

export const EXPENSE_CATEGORIES = [
  {
    key: 'salary_cook',
    labels: { uz: 'Oshpaz maoshi', ru: 'Зарплата повара', en: 'Salary cook' },
  },
  {
    key: 'salary_manager',
    labels: { uz: 'Menejer maoshi', ru: 'Зарплата менеджера', en: 'Salary manager' },
  },
  {
    key: 'salary_waiter',
    labels: { uz: 'Ofitsiant maoshi', ru: 'Зарплата официанта', en: 'Salary waiter' },
  },
  {
    key: 'salary_other',
    labels: { uz: 'Boshqa maosh', ru: 'Другая зарплата', en: 'Other salary' },
  },
  {
    key: 'products_bazaar',
    labels: { uz: 'Bozor mahsulotlari', ru: 'Продукты / базар', en: 'Products / bazaar' },
  },
  {
    key: 'equipment',
    labels: { uz: 'Jihozlar', ru: 'Оборудование', en: 'Equipment' },
  },
  {
    key: 'utilities',
    labels: { uz: 'Kommunal', ru: 'Коммунальные', en: 'Utilities' },
  },
  {
    key: 'rent',
    labels: { uz: 'Ijara', ru: 'Аренда', en: 'Rent' },
  },
  {
    key: 'delivery',
    labels: { uz: 'Yetkazib berish xarajati', ru: 'Расходы доставки', en: 'Delivery costs' },
  },
  {
    key: 'marketing',
    labels: { uz: 'Marketing', ru: 'Маркетинг', en: 'Marketing' },
  },
  {
    key: 'repair',
    labels: { uz: 'Ta’mirlash', ru: 'Ремонт', en: 'Repair' },
  },
  {
    key: 'other',
    labels: { uz: 'Boshqa', ru: 'Другое', en: 'Other' },
  },
]

export const INCOME_CATEGORIES = [
  {
    key: 'investor_support',
    labels: { uz: 'Investor yordami', ru: 'Поддержка инвестора', en: 'Investor support' },
  },
  {
    key: 'other_income',
    labels: { uz: 'Boshqa daromad', ru: 'Другой доход', en: 'Other income' },
  },
]

export function todayExpenseDate() {
  return toLocalDateStr(new Date().toISOString())
}

export function expenseCategoryLabel(category, lang = 'en') {
  const cfg = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]
    .find(item => item.key === category) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]
  return cfg.labels[lang] || cfg.labels.en
}

export function normalizeExpenseEntryType(value) {
  return EXPENSE_ENTRY_TYPES.includes(value) ? value : 'expense'
}

export function expensePaymentMethodLabel(method, lang = 'en') {
  const labels = {
    cash: { uz: 'Naqd', ru: 'Наличные', en: 'Cash' },
    card: { uz: 'Karta', ru: 'Карта', en: 'Card' },
    terminal: { uz: 'Terminal', ru: 'Терминал', en: 'Terminal' },
  }
  const cfg = labels[method] || labels.cash
  return cfg[lang] || cfg.en
}

export function normalizeExpenseAmount(value) {
  const normalizedValue = typeof value === 'string'
    ? value.replace(/\s+/g, '').replace(/,/g, '')
    : value
  const amount = Math.round(Number(normalizedValue) || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

export const SALARY_PAY_SCHEDULES = ['daily', 'twice_weekly', 'monthly']
export const SALARY_RATE_UNITS = ['daily', 'monthly']

export function normalizePaySchedule(value) {
  return SALARY_PAY_SCHEDULES.includes(value) ? value : 'monthly'
}

export function normalizeSalaryRateUnit(value) {
  return SALARY_RATE_UNITS.includes(value) ? value : 'daily'
}

export function getSalaryCategoryForRole(role) {
  const normalized = String(role || '').toLowerCase()
  if (normalized === 'waiter') return 'salary_waiter'
  if (['owner', 'admin', 'cashier'].includes(normalized)) return 'salary_manager'
  return 'salary_other'
}

export function getCurrentSalaryRate(salaryProfile, asOfDate = todayExpenseDate()) {
  const rates = [...(salaryProfile?.rates || [])]
    .filter(rate => rate?.effective_from && rate.effective_from <= asOfDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
  return rates[0] || null
}

export function convertSalaryAmountToDaily(amount, rateUnit) {
  const normalized = normalizeExpenseAmount(amount)
  if (normalized <= 0) return 0
  return normalizeSalaryRateUnit(rateUnit) === 'monthly'
    ? Math.round(normalized / 30)
    : normalized
}

export function getDailySalaryAmount(salaryProfile, asOfDate = todayExpenseDate()) {
  const rate = getCurrentSalaryRate(salaryProfile, asOfDate)
  return convertSalaryAmountToDaily(rate?.amount ?? rate?.daily_amount, rate?.rate_unit)
}

export function getSalaryActiveUntil(salaryProfile, dateTo = todayExpenseDate()) {
  const endDate = String(salaryProfile?.ended_at || '').slice(0, 10)
  if (!endDate) return dateTo
  return endDate < dateTo ? endDate : dateTo
}

export function buildSalaryExpenseRows(salaryProfiles = [], dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return []
  const rows = []
  for (const salaryProfile of salaryProfiles || []) {
    if (!salaryProfile) continue
    const joinedAt = String(salaryProfile.joined_at || dateFrom).slice(0, 10)
    const activeUntil = getSalaryActiveUntil(salaryProfile, dateTo)
    const start = joinedAt > dateFrom ? joinedAt : dateFrom
    if (start > activeUntil) continue
    for (let date = start; date <= activeUntil; date = addLocalDateDays(date, 1)) {
      const dailyAmount = getDailySalaryAmount(salaryProfile, date)
      if (dailyAmount <= 0) continue
      const name = salaryProfile.employee_name || salaryProfile.profile?.full_name || salaryProfile.profile?.email || ''
      rows.push({
        id: `salary-${salaryProfile.id}-${date}`,
        expense_date: date,
        category: getSalaryCategoryForRole(salaryProfile.profile?.role),
        payment_method: salaryProfile.payment_method || 'cash',
        amount: dailyAmount,
        vendor: name,
        description: 'Automatic daily salary',
        created_by_name: name,
        is_salary_auto: true,
        salary_profile_id: salaryProfile.id,
        employee_id: salaryProfile.profile_id,
      })
    }
  }
  return rows
}

export function buildSalaryPaymentExpenseRows(salaryProfiles = [], dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return []
  const rows = []
  for (const salaryProfile of salaryProfiles || []) {
    if (!salaryProfile) continue
    const name = salaryProfile.employee_name || salaryProfile.profile?.full_name || salaryProfile.profile?.email || ''
    for (const payment of salaryProfile.payments || []) {
      const expenseDate = String(payment?.paid_date || '').slice(0, 10)
      if (!expenseDate || expenseDate < dateFrom || expenseDate > dateTo) continue
      const amount = normalizeExpenseAmount(payment?.amount)
      if (amount <= 0) continue
      rows.push({
        id: `salary-payment-${payment.id}`,
        expense_date: expenseDate,
        category: getSalaryCategoryForRole(salaryProfile.profile?.role),
        payment_method: payment.payment_method || salaryProfile.payment_method || 'cash',
        amount,
        vendor: name,
        description: payment.note || 'Salary payment',
        created_by_name: payment.created_by_name || name,
        is_salary_payment: true,
        salary_profile_id: salaryProfile.id,
        employee_id: salaryProfile.profile_id,
      })
    }
  }
  return rows
}

export function buildSalaryBonusExpenseRows(salaryProfiles = [], dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return []
  const rows = []
  for (const salaryProfile of salaryProfiles || []) {
    if (!salaryProfile) continue
    const name = salaryProfile.employee_name || salaryProfile.profile?.full_name || salaryProfile.profile?.email || ''
    for (const bonus of salaryProfile.bonuses || []) {
      const expenseDate = String(bonus?.bonus_date || '').slice(0, 10)
      if (!expenseDate || expenseDate < dateFrom || expenseDate > dateTo) continue
      const amount = normalizeExpenseAmount(bonus?.amount)
      if (amount <= 0) continue
      rows.push({
        id: `salary-bonus-${bonus.id}`,
        expense_date: expenseDate,
        category: getSalaryCategoryForRole(salaryProfile.profile?.role),
        payment_method: bonus.payment_method || salaryProfile.payment_method || 'cash',
        amount,
        vendor: name,
        description: bonus.note || 'Employee bonus',
        created_by_name: bonus.created_by_name || name,
        is_salary_bonus: true,
        salary_profile_id: salaryProfile.id,
        employee_id: salaryProfile.profile_id,
      })
    }
  }
  return rows
}

export function getSalaryPaidAmount(salaryProfile, dateTo = todayExpenseDate()) {
  return (salaryProfile?.payments || []).reduce((sum, payment) => {
    if (payment?.paid_date && payment.paid_date > dateTo) return sum
    return sum + normalizeExpenseAmount(payment?.amount)
  }, 0)
}

export function getSalaryDue(salaryProfile, dateTo = todayExpenseDate()) {
  const joinedAt = String(salaryProfile?.joined_at || dateTo).slice(0, 10)
  const activeUntil = getSalaryActiveUntil(salaryProfile, dateTo)
  const accrued = summarizeExpenses(buildSalaryExpenseRows([salaryProfile], joinedAt, activeUntil)).total
  return Math.max(0, accrued - getSalaryPaidAmount(salaryProfile, dateTo))
}

export function getTotalSalaryDue(salaryProfiles = [], dateTo = todayExpenseDate()) {
  return (salaryProfiles || []).reduce((sum, salaryProfile) => (
    sum + getSalaryDue(salaryProfile, dateTo)
  ), 0)
}

function addLocalDateDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toLocalDateStr(date.toISOString())
}

export function expenseMatchesRange(expense, dateFrom, dateTo) {
  const date = expense?.expense_date || expense?.expenseDate || ''
  if (!date) return false
  if (dateFrom && date < dateFrom) return false
  if (dateTo && date > dateTo) return false
  return true
}

export function summarizeIncomeEntries(entries = []) {
  const summary = {
    total: 0,
    count: 0,
    byCategory: {},
    byMethod: {},
  }

  for (const entry of entries) {
    if (normalizeExpenseEntryType(entry?.entry_type) !== 'income') continue
    const amount = normalizeExpenseAmount(entry?.amount)
    if (amount <= 0) continue
    summary.total += amount
    summary.count += 1
    const category = entry?.category || 'other_income'
    const method = entry?.payment_method || entry?.paymentMethod || 'cash'
    summary.byCategory[category] = (summary.byCategory[category] || 0) + amount
    summary.byMethod[method] = (summary.byMethod[method] || 0) + amount
  }

  return summary
}

export function summarizeExpenses(expenses = []) {
  const summary = {
    total: 0,
    count: 0,
    byCategory: {},
    byMethod: {},
  }

  for (const expense of expenses) {
    if (normalizeExpenseEntryType(expense?.entry_type) !== 'expense') continue
    const amount = normalizeExpenseAmount(expense?.amount)
    if (amount <= 0) continue
    summary.total += amount
    summary.count += 1
    const category = expense?.category || 'other'
    const method = expense?.payment_method || expense?.paymentMethod || 'cash'
    summary.byCategory[category] = (summary.byCategory[category] || 0) + amount
    summary.byMethod[method] = (summary.byMethod[method] || 0) + amount
  }

  return summary
}

export function summarizeExpenseCashflow(paidOrders = [], expenses = []) {
  const byMethod = EXPENSE_PAYMENT_METHODS.reduce((acc, method) => {
    acc[method] = { income: 0, expenses: 0, left: 0 }
    return acc
  }, {})

  for (const order of paidOrders || []) {
    for (const payment of getOrderPayments(order)) {
      const method = payment.method || payment.payment_method
      if (!byMethod[method]) continue
      byMethod[method].income += normalizeExpenseAmount(payment.amount)
    }
  }

  const incomeSummary = summarizeIncomeEntries(expenses)
  for (const method of EXPENSE_PAYMENT_METHODS) {
    byMethod[method].income += incomeSummary.byMethod[method] || 0
  }

  const expenseSummary = summarizeExpenses(expenses)
  for (const method of EXPENSE_PAYMENT_METHODS) {
    byMethod[method].expenses = expenseSummary.byMethod[method] || 0
    byMethod[method].left = byMethod[method].income - byMethod[method].expenses
  }

  return {
    byMethod,
    rows: EXPENSE_PAYMENT_METHODS.map(method => ({ method, ...byMethod[method] })),
  }
}

export function getNetIncome(revenue = 0, expenses = []) {
  return Math.round(Number(revenue) || 0) + summarizeIncomeEntries(expenses).total - summarizeExpenses(expenses).total
}
