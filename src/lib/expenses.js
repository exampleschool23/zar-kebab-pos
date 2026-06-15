import { toLocalDateStr } from './analytics.js'

export const EXPENSE_PAYMENT_METHODS = ['cash', 'card', 'terminal']

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

export function todayExpenseDate() {
  return toLocalDateStr(new Date().toISOString())
}

export function expenseCategoryLabel(category, lang = 'en') {
  const cfg = EXPENSE_CATEGORIES.find(item => item.key === category) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]
  return cfg.labels[lang] || cfg.labels.en
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
  const amount = Math.round(Number(value) || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

export function expenseMatchesRange(expense, dateFrom, dateTo) {
  const date = expense?.expense_date || expense?.expenseDate || ''
  if (!date) return false
  if (dateFrom && date < dateFrom) return false
  if (dateTo && date > dateTo) return false
  return true
}

export function summarizeExpenses(expenses = []) {
  const summary = {
    total: 0,
    count: 0,
    byCategory: {},
    byMethod: {},
  }

  for (const expense of expenses) {
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

export function getNetIncome(revenue = 0, expenses = []) {
  return Math.round(Number(revenue) || 0) - summarizeExpenses(expenses).total
}

