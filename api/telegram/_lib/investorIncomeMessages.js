import { expensePaymentMethodLabel } from '../../../src/lib/expenses.js'
import { formatCurrency } from '../../../src/lib/formatCurrency.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'

const COPY = {
  uz: {
    title: 'Investor yordami',
    amount: 'Summa',
    date: 'Sana',
    method: 'To‘lov turi',
    source: 'Investor yoki manba',
    description: 'Izoh',
  },
  ru: {
    title: 'Поддержка инвестора',
    amount: 'Сумма',
    date: 'Дата',
    method: 'Способ оплаты',
    source: 'Инвестор или источник',
    description: 'Описание',
  },
  en: {
    title: 'Investor support',
    amount: 'Amount',
    date: 'Date',
    method: 'Payment method',
    source: 'Investor or source',
    description: 'Description',
  },
}

function normalizeLanguage(language) {
  return ['uz', 'ru', 'en'].includes(language) ? language : 'ru'
}

export function buildInvestorIncomeGroupMessage(expense, language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = COPY[lang]
  const lines = [
    `💰 <b>${copy.title}</b>`,
    `${copy.amount}: <b>${escapeTelegramHtml(formatCurrency(expense?.amount || 0))}</b>`,
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(expense?.expense_date, lang, expense?.expense_date || '—'))}`,
    `${copy.method}: ${escapeTelegramHtml(expensePaymentMethodLabel(expense?.payment_method, lang))}`,
  ]
  if (expense?.vendor) lines.push(`${copy.source}: ${escapeTelegramHtml(expense.vendor)}`)
  if (expense?.description) lines.push(`${copy.description}: ${escapeTelegramHtml(expense.description)}`)
  return lines.join('\n')
}
