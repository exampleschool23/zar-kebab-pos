import { getOrderPayments, toLocalDateStr } from './analytics.js'

export const EXPENSE_PAYMENT_METHODS = ['cash', 'card', 'terminal']
export const ACCOUNTING_CASHFLOW_METHODS = ['cash', 'card', 'terminal', 'loyalty_card']
export const EXPENSE_ENTRY_TYPES = ['expense', 'income']
export const DEFAULT_MONTHLY_RENT_UZS = 0
export const DEFAULT_MONTHLY_UTILITIES_UZS = 0
export const ACCOUNTING_HISTORY_START_DATE = '2000-01-01'

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
    key: 'salary_one_time',
    labels: { uz: 'Bir martalik xodim maoshi', ru: 'Разовая зарплата сотрудника', en: 'One-time employee salary' },
  },
  {
    key: 'products_bazaar',
    labels: { uz: 'Bozor mahsulotlari', ru: 'Продукты / базар', en: 'Products / bazaar' },
  },
  {
    key: 'charcoal',
    labels: { uz: 'Ko‘mir', ru: 'Уголь', en: 'Charcoal' },
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
    key: 'tax',
    labels: { uz: 'Soliq', ru: 'Налоги', en: 'Taxes' },
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
]

const LEGACY_INCOME_CATEGORIES = [
  {
    key: 'other_income',
    labels: { uz: 'Boshqa daromad', ru: 'Другой доход', en: 'Other income' },
  },
]

export const MANUAL_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter(category => (
  (!category.key.startsWith('salary_') || category.key === 'salary_one_time') &&
  category.key !== 'products_bazaar' &&
  category.key !== 'other'
))

export function todayExpenseDate() {
  return toLocalDateStr(new Date().toISOString())
}

export function getAccountingHistoryRange(period = 'thisMonth', today = todayExpenseDate()) {
  const normalizedToday = /^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))
    ? String(today)
    : todayExpenseDate()
  if (period === 'allTime') {
    return { dateFrom: ACCOUNTING_HISTORY_START_DATE, dateTo: normalizedToday }
  }

  const thisMonthStart = `${normalizedToday.slice(0, 8)}01`
  if (period !== 'lastMonth') {
    return { dateFrom: thisMonthStart, dateTo: normalizedToday }
  }

  const [year, month] = normalizedToday.split('-').map(Number)
  const previousMonthEnd = toLocalDateStr(new Date(Date.UTC(year, month - 1, 0, 12)).toISOString())
  return {
    dateFrom: `${previousMonthEnd.slice(0, 8)}01`,
    dateTo: previousMonthEnd,
  }
}

export function expenseCategoryLabel(category, lang = 'en') {
  const cfg = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...LEGACY_INCOME_CATEGORIES]
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
    mixed: { uz: 'Aralash', ru: 'Смешанный', en: 'Mixed' },
    loyalty_card: { uz: 'Sodiqlik', ru: 'Лояльность', en: 'Loyalty' },
  }
  const cfg = labels[method] || labels.cash
  return cfg[lang] || cfg.en
}

export function expenseDescriptionLabel(value, lang = 'en') {
  const description = String(value || '').trim()
  if (!description) return ''

  const selectedLang = ['uz', 'ru', 'en'].includes(lang) ? lang : 'en'
  const systemLabels = {
    'Salary payment': {
      uz: 'Maosh to‘lovi',
      ru: 'Выплата зарплаты',
      en: 'Salary payment',
    },
    'Employee bonus': {
      uz: 'Xodim bonusi',
      ru: 'Бонус сотруднику',
      en: 'Employee bonus',
    },
    'Automatic daily salary': {
      uz: 'Avtomatik kunlik maosh',
      ru: 'Автоматическая дневная зарплата',
      en: 'Automatic daily salary',
    },
  }
  if (systemLabels[description]) return systemLabels[description][selectedLang]

  const dailyBazaarMatch = description.match(/^Daily Bazaar purchase \((\d+) items?\)$/)
  if (!dailyBazaarMatch) return description

  const count = Number(dailyBazaarMatch[1]) || 0
  if (selectedLang === 'uz') return `Kunlik bozor xaridi (${count} ta mahsulot)`
  if (selectedLang === 'ru') return `Покупка на ежедневном базаре (${count} поз.)`
  return `Daily Bazaar purchase (${count} ${count === 1 ? 'item' : 'items'})`
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

function getCalendarMonthParts(asOfDate = todayExpenseDate()) {
  const date = String(asOfDate || todayExpenseDate()).slice(0, 10)
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return { date, year: 0, month: 0, day: 0, daysInMonth: 0 }
  return {
    date,
    year,
    month,
    day,
    daysInMonth: new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate(),
  }
}

function getMonthlyRateAmount(rate) {
  const explicitAmount = normalizeExpenseAmount(rate?.amount)
  if (explicitAmount > 0) return explicitAmount
  // Older rows could have only the compatibility daily_amount column. Monthly
  // rows stored that value as amount / 30, so reconstruct the monthly rate.
  return normalizeSalaryRateUnit(rate?.rate_unit) === 'monthly'
    ? normalizeExpenseAmount(rate?.daily_amount) * 30
    : normalizeExpenseAmount(rate?.daily_amount)
}

export function allocateMonthlySalaryToDate(amount, asOfDate = todayExpenseDate()) {
  const normalized = normalizeExpenseAmount(amount)
  const { day, daysInMonth } = getCalendarMonthParts(asOfDate)
  if (normalized <= 0 || daysInMonth <= 0 || day <= 0 || day > daysInMonth) return 0

  // Spread indivisible UZS deterministically over the first days of the month.
  // This guarantees that every complete calendar month totals the configured
  // monthly salary exactly, including February and leap years.
  const baseAmount = Math.floor(normalized / daysInMonth)
  const remainder = normalized % daysInMonth
  return baseAmount + (day <= remainder ? 1 : 0)
}

export function getDailySalaryAmount(salaryProfile, asOfDate = todayExpenseDate()) {
  const rate = getCurrentSalaryRate(salaryProfile, asOfDate)
  if (normalizeSalaryRateUnit(rate?.rate_unit) === 'monthly') {
    return allocateMonthlySalaryToDate(getMonthlyRateAmount(rate), asOfDate)
  }
  return getMonthlyRateAmount(rate)
}

export function getMonthlySalaryCommitment(salaryProfile, asOfDate = todayExpenseDate()) {
  if (!salaryProfile || salaryProfile.is_active === false) return 0
  const { year, month, daysInMonth } = getCalendarMonthParts(asOfDate)
  if (!year || !month || !daysInMonth) return 0
  const monthStart = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return getSalaryAccruedAmount(salaryProfile, monthStart, monthEnd)
}

export function getTotalMonthlySalaryCommitment(salaryProfiles = [], asOfDate = todayExpenseDate()) {
  return (salaryProfiles || []).reduce((sum, salaryProfile) => (
    sum + getMonthlySalaryCommitment(salaryProfile, asOfDate)
  ), 0)
}

export function getSalaryActiveUntil(salaryProfile, dateTo = todayExpenseDate()) {
  const endDate = String(salaryProfile?.ended_at || '').slice(0, 10)
  if (!endDate) return dateTo
  return endDate < dateTo ? endDate : dateTo
}

export function normalizeSalaryEndDate(salaryProfile, value, fallbackDate = todayExpenseDate()) {
  const fallback = String(fallbackDate || todayExpenseDate()).slice(0, 10)
  let endDate = String(value || salaryProfile?.ended_at || fallback).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) endDate = fallback

  const joinedAt = String(salaryProfile?.joined_at || '').slice(0, 10)
  if (joinedAt && endDate < joinedAt) return joinedAt
  if (fallback && endDate > fallback) return fallback
  return endDate
}

export function getSalaryAbsenceDates(salaryProfile) {
  return new Set((salaryProfile?.absences || [])
    .map(absence => String(absence?.absence_date || absence?.date || '').slice(0, 10))
    .filter(Boolean)
  )
}

export function getSalaryAbsenceForDate(salaryProfile, date = todayExpenseDate()) {
  const targetDate = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null
  return (salaryProfile?.absences || []).find(absence => (
    String(absence?.absence_date || absence?.date || '').slice(0, 10) === targetDate
  )) || null
}

export function listLocalDateRange(dateFrom, dateTo) {
  const start = String(dateFrom || '').slice(0, 10)
  const end = String(dateTo || '').slice(0, 10)
  if (!start || !end || start > end) return []
  const dates = []
  for (let date = start; date <= end; date = addLocalDateDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

export function getEmployeeMealExpenseEstimate(
  salaryProfiles = [],
  dateFrom,
  dateTo,
  averageDailyEmployeeMealUzs = 0,
) {
  const dailyMealUzs = normalizeExpenseAmount(averageDailyEmployeeMealUzs)
  let presentEmployeeDays = 0

  if (dailyMealUzs > 0) {
    for (const salaryProfile of salaryProfiles || []) {
      if (!salaryProfile) continue
      if (salaryProfile.is_active === false && !salaryProfile.ended_at) continue
      const joinedAt = String(salaryProfile.joined_at || dateFrom).slice(0, 10)
      const activeUntil = getSalaryActiveUntil(salaryProfile, dateTo)
      const start = joinedAt > dateFrom ? joinedAt : dateFrom
      if (!start || !activeUntil || start > activeUntil) continue
      const absenceDates = getSalaryAbsenceDates(salaryProfile)
      presentEmployeeDays += listLocalDateRange(start, activeUntil)
        .filter(date => !absenceDates.has(date))
        .length
    }
  }

  return {
    averageDailyEmployeeMealUzs: dailyMealUzs,
    presentEmployeeDays,
    total: dailyMealUzs * presentEmployeeDays,
  }
}

export function buildSalaryReactivationAbsenceRows(salaryProfile, reactivatedAt = todayExpenseDate(), note = 'Inactive employment period') {
  const salaryProfileId = salaryProfile?.id
  const inactiveFrom = String(salaryProfile?.ended_at || '').slice(0, 10)
  const inactiveUntil = String(reactivatedAt || todayExpenseDate()).slice(0, 10)
  if (!salaryProfileId || !inactiveFrom || !inactiveUntil) return []
  const existingAbsences = getSalaryAbsenceDates(salaryProfile)
  return listLocalDateRange(inactiveFrom, inactiveUntil)
    .filter(absenceDate => !existingAbsences.has(absenceDate))
    .map(absenceDate => ({
      salary_profile_id: salaryProfileId,
      absence_date: absenceDate,
      note,
    }))
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
    const absenceDates = getSalaryAbsenceDates(salaryProfile)
    for (let date = start; date <= activeUntil; date = addLocalDateDays(date, 1)) {
      if (absenceDates.has(date)) continue
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

export function getSalaryAccruedAmount(salaryProfile, dateFrom, dateTo) {
  return buildSalaryExpenseRows([salaryProfile], dateFrom, dateTo)
    .reduce((sum, row) => sum + normalizeExpenseAmount(row.amount), 0)
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
        source_id: payment.id,
        source_table: 'employee_salary_payments',
        expense_date: expenseDate,
        category: getSalaryCategoryForRole(salaryProfile.profile?.role),
        payment_method: payment.payment_method || salaryProfile.payment_method || 'cash',
        amount,
        vendor: name,
        description: payment.note || 'Salary payment',
        created_by_name: payment.created_by_name || name,
        created_at: payment.created_at,
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
        source_id: bonus.id,
        source_table: 'employee_salary_bonuses',
        expense_date: expenseDate,
        category: getSalaryCategoryForRole(salaryProfile.profile?.role),
        payment_method: bonus.payment_method || salaryProfile.payment_method || 'cash',
        amount,
        vendor: name,
        description: bonus.note || 'Employee bonus',
        created_by_name: bonus.created_by_name || name,
        created_at: bonus.created_at,
        is_salary_bonus: true,
        salary_profile_id: salaryProfile.id,
        employee_id: salaryProfile.profile_id,
      })
    }
  }
  return rows
}

export function isGeneratedSalaryExpense(expense) {
  const id = String(expense?.id || '')
  return Boolean(
    expense?.is_salary_auto ||
    expense?.is_salary_payment ||
    expense?.is_salary_bonus ||
    id.startsWith('salary-')
  )
}

export function getExpenseHistoryDeleteTarget(expense) {
  if (!expense?.id || expense.is_bazaar_daily_total) return null

  if (expense.is_salary_bonus) {
    const rowId = String(expense.id)
    const sourceId = expense.source_id || (
      rowId.startsWith('salary-bonus-')
        ? rowId.slice('salary-bonus-'.length)
        : ''
    )
    return sourceId ? { table: 'employee_salary_bonuses', id: sourceId } : null
  }

  if (isGeneratedSalaryExpense(expense)) return null
  return { table: 'expenses', id: expense.id }
}

export function getSalaryPaidAmount(salaryProfile, dateTo = todayExpenseDate()) {
  return (salaryProfile?.payments || []).reduce((sum, payment) => {
    const paidDate = String(payment?.paid_date || '').slice(0, 10)
    if (paidDate && paidDate > dateTo) return sum
    return sum + normalizeExpenseAmount(payment?.amount)
  }, 0)
}

export function getSalaryFineAmount(salaryProfile, dateTo = todayExpenseDate()) {
  return (salaryProfile?.fines || []).reduce((sum, fine) => {
    const fineDate = String(fine?.fine_date || '').slice(0, 10)
    if (fineDate && fineDate > dateTo) return sum
    return sum + normalizeExpenseAmount(fine?.amount)
  }, 0)
}

export function getSalaryBalance(salaryProfile, dateTo = todayExpenseDate()) {
  const joinedAt = String(salaryProfile?.joined_at || dateTo).slice(0, 10)
  const activeUntil = getSalaryActiveUntil(salaryProfile, dateTo)
  const accrued = getSalaryAccruedAmount(salaryProfile, joinedAt, activeUntil)
  return accrued - getSalaryPaidAmount(salaryProfile, dateTo) - getSalaryFineAmount(salaryProfile, dateTo)
}

export function getSalaryDue(salaryProfile, dateTo = todayExpenseDate()) {
  return Math.max(0, getSalaryBalance(salaryProfile, dateTo))
}

export function canRecordSalaryTransaction(salaryProfile, entryType = 'payment', asOfDate = todayExpenseDate()) {
  if (!salaryProfile || salaryProfile.deleted_at) return false
  if (salaryProfile.is_active !== false) return true
  return ['payment', 'fine'].includes(entryType) && getSalaryDue(salaryProfile, asOfDate) > 0
}

export function getTotalSalaryDue(salaryProfiles = [], dateTo = todayExpenseDate()) {
  return (salaryProfiles || []).reduce((sum, salaryProfile) => (
    sum + getSalaryDue(salaryProfile, dateTo)
  ), 0)
}

export function getSalaryMonthEndDate(asOfDate = todayExpenseDate()) {
  const date = String(asOfDate || todayExpenseDate()).slice(0, 10)
  const [year, month] = date.split('-').map(Number)
  if (!year || !month) return date
  const monthEnd = new Date(Date.UTC(year, month, 0, 12, 0, 0))
  return toLocalDateStr(monthEnd.toISOString())
}

export function getEstimatedMonthlyExpenseSummary(salaryProfiles = [], asOfDate = todayExpenseDate(), options = {}) {
  const date = String(asOfDate || todayExpenseDate()).slice(0, 10)
  const monthStart = `${date.slice(0, 8)}01`
  const monthEnd = getSalaryMonthEndDate(date)
  const paidThroughDate = date > monthEnd ? monthEnd : date
  const activeFromDate = String(options.activeFromDate || '').slice(0, 10)
  const isBeforeActiveMonth = activeFromDate && monthEnd < activeFromDate
  const monthlyRentUzs = isBeforeActiveMonth ? 0 : Math.max(0, Math.round(Number(options.monthlyRentUzs ?? DEFAULT_MONTHLY_RENT_UZS) || 0))
  const monthlyUtilitiesUzs = isBeforeActiveMonth ? 0 : Math.max(0, Math.round(Number(options.monthlyUtilitiesUzs ?? DEFAULT_MONTHLY_UTILITIES_UZS) || 0))
  let employeePaidToDate = 0
  let employeeFineToDate = 0
  let employeeProjectedMonth = 0
  let employeeOpeningArrears = 0
  let employeePaidTowardArrears = 0
  let employeeAppliedToCurrentMonth = 0

  if (!isBeforeActiveMonth) {
    const dayBeforeMonth = addLocalDateDays(monthStart, -1)
    for (const salaryProfile of salaryProfiles || []) {
      if (!salaryProfile) continue
      const joinedAt = String(salaryProfile.joined_at || monthStart).slice(0, 10)
      const projectedThisMonth = getSalaryAccruedAmount(salaryProfile, monthStart, monthEnd)
      const accruedBeforeMonth = joinedAt < monthStart
        ? getSalaryAccruedAmount(salaryProfile, joinedAt, dayBeforeMonth)
        : 0
      const paidBeforeMonth = (salaryProfile.payments || []).reduce((sum, payment) => {
        const paidDate = String(payment?.paid_date || '').slice(0, 10)
        return paidDate && paidDate < monthStart
          ? sum + normalizeExpenseAmount(payment.amount)
          : sum
      }, 0)
      const paidThisMonth = (salaryProfile.payments || []).reduce((sum, payment) => {
        const paidDate = String(payment?.paid_date || '').slice(0, 10)
        return paidDate >= monthStart && paidDate <= paidThroughDate
          ? sum + normalizeExpenseAmount(payment.amount)
          : sum
      }, 0)
      const finedBeforeMonth = (salaryProfile.fines || []).reduce((sum, fine) => {
        const fineDate = String(fine?.fine_date || '').slice(0, 10)
        return fineDate && fineDate < monthStart
          ? sum + normalizeExpenseAmount(fine.amount)
          : sum
      }, 0)
      const finedThisMonth = (salaryProfile.fines || []).reduce((sum, fine) => {
        const fineDate = String(fine?.fine_date || '').slice(0, 10)
        return fineDate >= monthStart && fineDate <= paidThroughDate
          ? sum + normalizeExpenseAmount(fine.amount)
          : sum
      }, 0)
      const settledBeforeMonth = paidBeforeMonth + finedBeforeMonth
      const openingArrears = Math.max(0, accruedBeforeMonth - settledBeforeMonth)
      const priorSettlementCredit = Math.max(0, settledBeforeMonth - accruedBeforeMonth)
      const settledThisMonth = priorSettlementCredit + paidThisMonth + finedThisMonth
      const paidTowardArrears = Math.min(openingArrears, settledThisMonth)
      const appliedToCurrentMonth = Math.min(
        projectedThisMonth,
        Math.max(0, settledThisMonth - paidTowardArrears),
      )

      employeePaidToDate += paidThisMonth
      employeeFineToDate += finedThisMonth
      employeeProjectedMonth += projectedThisMonth
      employeeOpeningArrears += openingArrears
      employeePaidTowardArrears += paidTowardArrears
      employeeAppliedToCurrentMonth += appliedToCurrentMonth
    }
  }
  const employeeRemainingThisMonth = Math.max(0, employeeProjectedMonth - employeeAppliedToCurrentMonth)
  const employeeArrearsRemaining = Math.max(0, employeeOpeningArrears - employeePaidTowardArrears)
  const employeeRemainingTotal = employeeArrearsRemaining + employeeRemainingThisMonth

  return {
    monthStart,
    monthEnd,
    paidThroughDate,
    activeFromDate,
    isBeforeActiveMonth: Boolean(isBeforeActiveMonth),
    monthlyRentUzs,
    monthlyUtilitiesUzs,
    employeePaidToDate,
    employeeFineToDate,
    employeeProjectedMonth,
    employeeOpeningArrears,
    employeePaidTowardArrears,
    employeeAppliedToCurrentMonth,
    employeeRemainingThisMonth,
    employeeArrearsRemaining,
    employeeRemainingTotal,
    estimatedMonthlyExpenseUzs: employeeProjectedMonth,
  }
}

export function getSelectedMonthSalaryOperatingSummary(salaryProfiles = [], asOfDate = todayExpenseDate()) {
  return (salaryProfiles || []).reduce((totals, salaryProfile) => {
    const estimate = getEstimatedMonthlyExpenseSummary([salaryProfile], asOfDate, {
      monthlyRentUzs: 0,
      monthlyUtilitiesUzs: 0,
    })
    const expectedSalaryCost = Math.max(0, estimate.employeeProjectedMonth - estimate.employeeFineToDate)
    const appliedPayment = Math.min(expectedSalaryCost, estimate.employeePaidToDate)

    totals.projectedSalary += estimate.employeeProjectedMonth
    totals.fines += estimate.employeeFineToDate
    totals.expectedSalaryCost += expectedSalaryCost
    totals.appliedPayments += appliedPayment
    totals.remainingSalary += Math.max(0, expectedSalaryCost - appliedPayment)
    totals.excludedPayments += Math.max(0, estimate.employeePaidToDate - appliedPayment)
    return totals
  }, {
    projectedSalary: 0,
    fines: 0,
    expectedSalaryCost: 0,
    appliedPayments: 0,
    remainingSalary: 0,
    excludedPayments: 0,
  })
}

export function addLocalDateDays(isoDate, days) {
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

export function summarizeExpenseCashflow(paidOrders = [], expenses = [], options = {}) {
  const orderIncomeByMethod = {}

  for (const order of paidOrders || []) {
    let hasLoyaltyPaymentRow = false
    for (const payment of getOrderPayments(order)) {
      const method = payment.method || payment.payment_method
      if (method === 'loyalty_card') hasLoyaltyPaymentRow = true
      if (!ACCOUNTING_CASHFLOW_METHODS.includes(method)) continue
      orderIncomeByMethod[method] = (
        orderIncomeByMethod[method] || 0
      ) + normalizeExpenseAmount(payment.amount)
    }
    const loyaltyUsed = normalizeExpenseAmount(order?.loyalty_used_amount ?? order?.loyalty_redeem_amount ?? 0)
    if (loyaltyUsed > 0 && !hasLoyaltyPaymentRow) {
      orderIncomeByMethod.loyalty_card = (
        orderIncomeByMethod.loyalty_card || 0
      ) + loyaltyUsed
    }
  }

  return summarizeExpenseCashflowFromIncome(orderIncomeByMethod, expenses, options)
}

export function summarizeExpenseCashflowFromIncome(orderIncomeByMethod = {}, expenses = [], options = {}) {
  const byMethod = ACCOUNTING_CASHFLOW_METHODS.reduce((acc, method) => {
    acc[method] = {
      income: normalizeExpenseAmount(orderIncomeByMethod?.[method]),
      expenses: 0,
      left: 0,
    }
    return acc
  }, {})

  if (options.includeIncomeEntries !== false) {
    const incomeSummary = summarizeIncomeEntries(expenses)
    for (const method of ACCOUNTING_CASHFLOW_METHODS) {
      byMethod[method].income += incomeSummary.byMethod[method] || 0
    }
  }

  const expenseSummary = summarizeExpenses(expenses)
  for (const method of ACCOUNTING_CASHFLOW_METHODS) {
    byMethod[method].expenses = expenseSummary.byMethod[method] || 0
    byMethod[method].left = byMethod[method].income - byMethod[method].expenses
  }

  return {
    byMethod,
    rows: ACCOUNTING_CASHFLOW_METHODS.map(method => ({ method, ...byMethod[method] })),
  }
}

export function getNetIncome(revenue = 0, expenses = []) {
  return Math.round(Number(revenue) || 0) + summarizeIncomeEntries(expenses).total - summarizeExpenses(expenses).total
}
