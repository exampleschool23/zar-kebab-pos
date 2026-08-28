import {
  expenseCategoryLabel,
  expenseDescriptionLabel,
  expensePaymentMethodLabel,
} from '../../../src/lib/expenses.js'
import { formatCurrency } from '../../../src/lib/formatCurrency.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'

const COPY = {
  uz: {
    title: 'Investor yordami',
    amount: 'Summa',
    currentMonthTotal: 'Joriy oydagi investor yordami',
    date: 'Sana',
    method: 'To‘lov turi',
    source: 'Investor yoki manba',
    description: 'Izoh',
  },
  ru: {
    title: 'Поддержка инвестора',
    amount: 'Сумма',
    currentMonthTotal: 'Поддержка инвестора за текущий месяц',
    date: 'Дата',
    method: 'Способ оплаты',
    source: 'Инвестор или источник',
    description: 'Описание',
  },
  en: {
    title: 'Investor support',
    amount: 'Amount',
    currentMonthTotal: 'Investor support this month',
    date: 'Date',
    method: 'Payment method',
    source: 'Investor or source',
    description: 'Description',
  },
}

const EXPENSE_COPY = {
  uz: {
    title: 'Yangi xarajat',
    amount: 'Summa',
    monthTotal: 'Oylik xarajatlar jami',
    date: 'Sana',
    category: 'Kategoriya',
    vendor: 'Yetkazuvchi yoki oluvchi',
    description: 'Izoh',
    addedBy: 'Kiritgan',
  },
  ru: {
    title: 'Новый расход',
    amount: 'Сумма',
    monthTotal: 'Расходы за месяц',
    date: 'Дата',
    category: 'Категория',
    vendor: 'Поставщик или получатель',
    description: 'Описание',
    addedBy: 'Добавил(а)',
  },
  en: {
    title: 'New expense',
    amount: 'Amount',
    monthTotal: 'Expenses for the month',
    date: 'Date',
    category: 'Category',
    vendor: 'Supplier or recipient',
    description: 'Description',
    addedBy: 'Added by',
  },
}

function normalizeLanguage(language) {
  return ['uz', 'ru', 'en'].includes(language) ? language : 'ru'
}

export function buildInvestorIncomeGroupMessage(expense, language = 'ru', currentMonthTotal = null) {
  const lang = normalizeLanguage(language)
  const copy = COPY[lang]
  const lines = [
    `💰 <b>${copy.title}</b>`,
    `${copy.amount}: <b>${escapeTelegramHtml(formatCurrency(expense?.amount || 0))}</b>`,
    '',
  ]
  lines.push(
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(expense?.expense_date, lang, expense?.expense_date || '—'))}`,
    `${copy.method}: ${escapeTelegramHtml(expensePaymentMethodLabel(expense?.payment_method, lang))}`,
  )
  if (expense?.vendor) lines.push(`${copy.source}: ${escapeTelegramHtml(expense.vendor)}`)
  if (expense?.description) {
    lines.push(`${copy.description}: ${escapeTelegramHtml(expenseDescriptionLabel(expense.description, lang))}`)
  }
  if (currentMonthTotal !== null && Number.isFinite(Number(currentMonthTotal))) {
    lines.push('', `${copy.currentMonthTotal}: <b>${escapeTelegramHtml(formatCurrency(currentMonthTotal))}</b>`)
  }
  return lines.join('\n')
}

export function buildInvestorExpenseGroupMessage(expense, language = 'ru', monthTotal = null) {
  const lang = normalizeLanguage(language)
  const copy = EXPENSE_COPY[lang]
  const lines = [
    `🧾 <b>${copy.title}</b>`,
    `${copy.amount}: <b>${escapeTelegramHtml(formatCurrency(expense?.amount || 0))}</b>`,
    '',
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(expense?.expense_date, lang, expense?.expense_date || '—'))}`,
    `${copy.category}: ${escapeTelegramHtml(expenseCategoryLabel(expense?.category, lang))}`,
  ]
  if (expense?.vendor) lines.push(`${copy.vendor}: ${escapeTelegramHtml(expense.vendor)}`)
  if (expense?.description) {
    lines.push(`${copy.description}: ${escapeTelegramHtml(expenseDescriptionLabel(expense.description, lang))}`)
  }
  if (expense?.actor_name || expense?.created_by_name) {
    lines.push(`${copy.addedBy}: ${escapeTelegramHtml(expense.actor_name || expense.created_by_name)}`)
  }
  if (monthTotal !== null && Number.isFinite(Number(monthTotal))) {
    lines.push('', `${copy.monthTotal}: <b>${escapeTelegramHtml(formatCurrency(monthTotal))}</b>`)
  }
  return lines.join('\n')
}

export function buildAbsenceUndoInvestorMessage(delivery, language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = {
    uz: { title: 'Yo‘qlik bekor qilindi', employee: 'Xodim', date: 'Sana', actor: 'Bekor qilgan' },
    ru: { title: 'Отсутствие отменено', employee: 'Сотрудник', date: 'Дата', actor: 'Отменил(а)' },
    en: { title: 'Absence undone', employee: 'Employee', date: 'Date', actor: 'Undone by' },
  }[lang]
  const lines = [
    `✅ <b>${copy.title}</b>`,
    `${copy.employee}: <b>${escapeTelegramHtml(delivery?.employee_name || '—')}</b>`,
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(delivery?.absence_date, lang, delivery?.absence_date || '—'))}`,
  ]
  if (delivery?.actor_name) lines.push(`${copy.actor}: ${escapeTelegramHtml(delivery.actor_name)}`)
  return lines.join('\n')
}
