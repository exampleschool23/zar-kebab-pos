import {
  expensePaymentMethodLabel,
  getSalaryAccruedAmount,
  getSalaryBalance,
  normalizeExpenseAmount,
} from '../../../src/lib/expenses.js'
import { formatDateOnly } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'

const COPY = {
  uz: {
    title: 'Kunlik maosh hisoboti',
    greeting: name => `Assalomu alaykum, ${name}!`,
    gratitude: 'Mehnatingiz uchun rahmat.',
    attendance: 'Kun holati',
    present: 'Ish kuni',
    absent: 'Ishga kelmadi',
    earned: 'Bugun hisoblangan',
    bonuses: 'Bugungi bonuslar',
    fines: 'Bugungi jarimalar',
    payments: 'Bugun to‘langan',
    none: 'Yo‘q',
    due: 'To‘lanishi kerak',
    currency: 'UZS',
  },
  ru: {
    title: 'Ежедневный отчёт по зарплате',
    greeting: name => `Здравствуйте, ${name}!`,
    gratitude: 'Спасибо за ваш труд.',
    attendance: 'Статус дня',
    present: 'Рабочий день',
    absent: 'Отсутствовал',
    earned: 'Начислено за день',
    bonuses: 'Бонусы за день',
    fines: 'Штрафы за день',
    payments: 'Выплачено за день',
    none: 'Нет',
    due: 'К выплате',
    currency: 'UZS',
  },
  en: {
    title: 'Daily salary summary',
    greeting: name => `Hello, ${name}!`,
    gratitude: 'Thank you for your work.',
    attendance: 'Day status',
    present: 'Working day',
    absent: 'Absent',
    earned: 'Earned today',
    bonuses: 'Bonuses today',
    fines: 'Fines today',
    payments: 'Paid today',
    none: 'None',
    due: 'Current salary due',
    currency: 'UZS',
  },
}

export function normalizeSalaryNotificationLanguage(language) {
  const value = String(language || '').slice(0, 2).toLowerCase()
  return COPY[value] ? value : 'ru'
}

export function formatSalaryNotificationAmount(value) {
  const numeric = typeof value === 'string'
    ? Number(value.replace(/\s/g, '').replace(/,/g, ''))
    : Number(value)
  const amount = Number.isFinite(numeric) ? Math.round(numeric) : 0
  return new Intl.NumberFormat('ru-RU')
    .format(amount)
    .replace(/\s/g, ' ')
}

export function getTashkentDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function addSalaryDateDays(date, dayCount) {
  const normalizedDate = String(date || '').slice(0, 10)
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  const value = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + Number(dayCount || 0),
    12
  ))
  return value.toISOString().slice(0, 10)
}

export function getCompletedTashkentDate(now = new Date()) {
  return addSalaryDateDays(getTashkentDate(now), -1)
}

export function getCompletedTashkentDates(now = new Date(), limit = 7) {
  const completedDate = getCompletedTashkentDate(now)
  const boundedLimit = Math.max(1, Math.min(31, Math.trunc(Number(limit) || 1)))
  return Array.from(
    { length: boundedLimit },
    (_, index) => addSalaryDateDays(completedDate, index - boundedLimit + 1)
  )
}

export function getDailySalaryNotificationSummary(salaryProfile, date) {
  const absence = (salaryProfile?.absences || []).find(
    item => String(item?.absence_date || item?.date || '').slice(0, 10) === date
  )
  const bonuses = (salaryProfile?.bonuses || [])
    .filter(bonus => String(bonus?.bonus_date || '').slice(0, 10) === date)
    .map(bonus => ({
      amount: normalizeExpenseAmount(bonus?.amount),
      detail: String(bonus?.note || '').trim(),
      paymentMethod: String(bonus?.payment_method || salaryProfile?.payment_method || 'cash'),
    }))
    .filter(bonus => bonus.amount > 0)

  const fines = (salaryProfile?.fines || [])
    .filter(fine => String(fine?.fine_date || '').slice(0, 10) === date)
    .map(fine => ({
      amount: normalizeExpenseAmount(fine?.amount),
      reason: String(fine?.reason || '').trim(),
    }))
    .filter(fine => fine.amount > 0)

  const payments = (salaryProfile?.payments || [])
    .filter(payment => String(payment?.paid_date || '').slice(0, 10) === date)
    .map(payment => ({
      amount: normalizeExpenseAmount(payment?.amount),
      detail: String(payment?.note || '').trim(),
      paymentMethod: String(payment?.payment_method || salaryProfile?.payment_method || 'cash'),
    }))
    .filter(payment => payment.amount > 0)

  return {
    date,
    absence: absence ? { note: String(absence?.note || '').trim() } : null,
    earned: getSalaryAccruedAmount(salaryProfile, date, date),
    bonuses,
    bonusTotal: bonuses.reduce((sum, bonus) => sum + bonus.amount, 0),
    fines,
    fineTotal: fines.reduce((sum, fine) => sum + fine.amount, 0),
    payments,
    paymentTotal: payments.reduce((sum, payment) => sum + payment.amount, 0),
    due: getSalaryBalance(salaryProfile, date),
  }
}

export function buildDailySalaryMessage(salaryProfile, date, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = COPY[lang]
  const summary = getDailySalaryNotificationSummary(salaryProfile, date)
  const transactionLine = transaction => {
    const detail = transaction.detail || expensePaymentMethodLabel(transaction.paymentMethod, lang)
    return `  • ${formatSalaryNotificationAmount(transaction.amount)} ${copy.currency} — ${escapeTelegramHtml(detail)}`
  }
  const bonusLines = summary.bonuses.length > 0
    ? summary.bonuses.map(transactionLine)
    : [`  • ${copy.none}`]
  const fineLines = summary.fines.length > 0
    ? summary.fines.map(fine => (
        `  • ${formatSalaryNotificationAmount(fine.amount)} ${copy.currency} — ${escapeTelegramHtml(fine.reason || '-')}`
      ))
    : [`  • ${copy.none}`]
  const paymentLines = summary.payments.length > 0
    ? summary.payments.map(transactionLine)
    : [`  • ${copy.none}`]
  const employeeName = escapeTelegramHtml(
    salaryProfile?.employee_name
      || salaryProfile?.profile?.full_name
      || salaryProfile?.profile?.email
      || 'сотрудник'
  )
  const attendanceValue = summary.absence
    ? `${copy.absent}${summary.absence.note ? ` — ${escapeTelegramHtml(summary.absence.note)}` : ''}`
    : copy.present
  const moneySections = [
    `<b>${copy.earned}:</b> ${formatSalaryNotificationAmount(summary.earned)} ${copy.currency}`,
    `<b>${copy.bonuses}:</b> ${formatSalaryNotificationAmount(summary.bonusTotal)} ${copy.currency}`,
  ]
  if (summary.bonusTotal > 0) {
    moneySections.push(...bonusLines)
  }
  if (summary.fineTotal > 0) {
    moneySections.push(
      `<b>${copy.fines}:</b> ${formatSalaryNotificationAmount(summary.fineTotal)} ${copy.currency}`,
      ...fineLines
    )
  }
  if (summary.paymentTotal > 0) {
    moneySections.push(
      `<b>${copy.payments}:</b> ${formatSalaryNotificationAmount(summary.paymentTotal)} ${copy.currency}`,
      ...paymentLines
    )
  }
  if (summary.due !== 0) {
    moneySections.push('', `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(summary.due)} ${copy.currency}`)
  }

  return [
    `💼 <b>${copy.title}</b>`,
    `📅 ${escapeTelegramHtml(formatDateOnly(date, date))}`,
    '',
    `<b>${copy.greeting(employeeName)}</b>`,
    copy.gratitude,
    `<b>${copy.attendance}:</b> ${attendanceValue}`,
    '',
    ...moneySections,
  ].join('\n').trim()
}

export function parseEmployeeStartToken(text) {
  const match = String(text || '').trim().match(/^\/start(?:@\w+)?\s+employee_([0-9a-f-]{36})$/i)
  return match?.[1]?.toLowerCase() || ''
}
