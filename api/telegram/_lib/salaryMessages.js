import {
  getSalaryAccruedAmount,
  getSalaryDue,
  normalizeExpenseAmount,
} from '../../../src/lib/expenses.js'
import { escapeTelegramHtml } from './telegram.js'

const COPY = {
  uz: {
    title: 'Kunlik maosh hisoboti',
    earned: 'Bugun hisoblangan',
    fines: 'Bugungi jarimalar',
    noFines: 'Yo‘q',
    due: 'To‘lanishi kerak',
    currency: 'UZS',
  },
  ru: {
    title: 'Ежедневный отчёт по зарплате',
    earned: 'Начислено сегодня',
    fines: 'Штрафы сегодня',
    noFines: 'Нет',
    due: 'К выплате',
    currency: 'UZS',
  },
  en: {
    title: 'Daily salary summary',
    earned: 'Earned today',
    fines: 'Fines today',
    noFines: 'None',
    due: 'Current salary due',
    currency: 'UZS',
  },
}

export function normalizeSalaryNotificationLanguage(language) {
  const value = String(language || '').slice(0, 2).toLowerCase()
  return COPY[value] ? value : 'ru'
}

export function formatSalaryNotificationAmount(value) {
  return new Intl.NumberFormat('ru-RU')
    .format(normalizeExpenseAmount(value))
    .replace(/\s/g, ' ')
}

export function getDailySalaryNotificationSummary(salaryProfile, date) {
  const fines = (salaryProfile?.fines || [])
    .filter(fine => String(fine?.fine_date || '').slice(0, 10) === date)
    .map(fine => ({
      amount: normalizeExpenseAmount(fine?.amount),
      reason: String(fine?.reason || '').trim(),
    }))
    .filter(fine => fine.amount > 0)

  return {
    date,
    earned: getSalaryAccruedAmount(salaryProfile, date, date),
    fines,
    fineTotal: fines.reduce((sum, fine) => sum + fine.amount, 0),
    due: getSalaryDue(salaryProfile, date),
  }
}

export function buildDailySalaryMessage(salaryProfile, date, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = COPY[lang]
  const summary = getDailySalaryNotificationSummary(salaryProfile, date)
  const fineLines = summary.fines.length > 0
    ? summary.fines.map(fine => (
        `  • ${formatSalaryNotificationAmount(fine.amount)} ${copy.currency} — ${escapeTelegramHtml(fine.reason || '-')}`
      ))
    : [`  • ${copy.noFines}`]

  return [
    `💼 <b>${copy.title}</b>`,
    escapeTelegramHtml(date),
    '',
    `<b>${copy.earned}:</b> ${formatSalaryNotificationAmount(summary.earned)} ${copy.currency}`,
    `<b>${copy.fines}:</b> ${formatSalaryNotificationAmount(summary.fineTotal)} ${copy.currency}`,
    ...fineLines,
    '',
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(summary.due)} ${copy.currency}`,
  ].join('\n')
}

export function parseEmployeeStartToken(text) {
  const match = String(text || '').trim().match(/^\/start(?:@\w+)?\s+employee_([0-9a-f-]{36})$/i)
  return match?.[1]?.toLowerCase() || ''
}
