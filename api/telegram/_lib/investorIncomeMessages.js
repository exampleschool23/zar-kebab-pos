import {
  expenseCategoryLabel,
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
    method: 'To‘lov turi',
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
    method: 'Способ оплаты',
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
    method: 'Payment method',
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
  if (expense?.description) lines.push(`${copy.description}: ${escapeTelegramHtml(expense.description)}`)
  if (Number.isFinite(Number(currentMonthTotal))) {
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
    `${copy.method}: ${escapeTelegramHtml(expensePaymentMethodLabel(expense?.payment_method, lang))}`,
  ]
  if (expense?.vendor) lines.push(`${copy.vendor}: ${escapeTelegramHtml(expense.vendor)}`)
  if (expense?.description) lines.push(`${copy.description}: ${escapeTelegramHtml(expense.description)}`)
  if (expense?.actor_name || expense?.created_by_name) {
    lines.push(`${copy.addedBy}: ${escapeTelegramHtml(expense.actor_name || expense.created_by_name)}`)
  }
  if (Number.isFinite(Number(monthTotal))) {
    lines.push('', `${copy.monthTotal}: <b>${escapeTelegramHtml(formatCurrency(monthTotal))}</b>`)
  }
  return lines.join('\n')
}
