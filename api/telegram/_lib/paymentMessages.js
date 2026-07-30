import { expensePaymentMethodLabel } from '../../../src/lib/expenses.js'
import { formatDateOnly } from '../../../src/lib/dateFormat.js'
import { escapeTelegramHtml } from './telegram.js'
import {
  formatSalaryNotificationAmount,
  normalizeSalaryNotificationLanguage,
} from './salaryMessages.js'

const COPY = {
  uz: {
    title: 'Maosh to‘lovi',
    greeting: name => `Assalomu alaykum, ${name}!`,
    recorded: 'Maosh to‘lovi qayd etildi.',
    amount: 'To‘langan summa',
    date: 'To‘lov sanasi',
    method: 'To‘lov turi',
    note: 'Izoh',
    due: 'Qolgan to‘lov',
    createdBy: 'Rasmiylashtirdi',
    confirm: 'Qabul qilganimni tasdiqlayman',
    confirmed: 'To‘lov qabul qilingani tasdiqlandi.',
  },
  ru: {
    title: 'Выплата зарплаты',
    greeting: name => `Здравствуйте, ${name}!`,
    recorded: 'Выплата зарплаты зарегистрирована.',
    amount: 'Выплачено',
    date: 'Дата выплаты',
    method: 'Способ оплаты',
    note: 'Примечание',
    due: 'Осталось к выплате',
    createdBy: 'Оформил',
    confirm: 'Подтвердить получение',
    confirmed: 'Получение выплаты подтверждено.',
  },
  en: {
    title: 'Salary payment',
    greeting: name => `Hello, ${name}!`,
    recorded: 'A salary payment was recorded.',
    amount: 'Amount paid',
    date: 'Payment date',
    method: 'Payment method',
    note: 'Note',
    due: 'Remaining salary due',
    createdBy: 'Recorded by',
    confirm: 'Confirm receipt',
    confirmed: 'Payment receipt confirmed.',
  },
}

const GROUP_COPY = {
  uz: {
    recorded: 'Xodimga maosh to‘lovi qayd etildi.',
    employee: 'Xodim',
  },
  ru: {
    recorded: 'Зарегистрирована выплата сотруднику.',
    employee: 'Сотрудник',
  },
  en: {
    recorded: 'A salary payment was recorded for an employee.',
    employee: 'Employee',
  },
}

export function getEmployeePaymentConfirmationCopy(language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  return {
    button: COPY[lang].confirm,
    confirmed: COPY[lang].confirmed,
  }
}

export function buildSalaryPaymentGroupMessage(payment, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = COPY[lang]
  const groupCopy = GROUP_COPY[lang]
  const lines = [
    `💵 <b>${copy.title}</b>`,
    '',
    groupCopy.recorded,
    '',
    `<b>${groupCopy.employee}:</b> ${escapeTelegramHtml(payment?.employee_name || '-')}`,
    `<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(payment?.amount)} UZS`,
    `<b>${copy.date}:</b> ${escapeTelegramHtml(formatDateOnly(payment?.paid_date, '-'))}`,
    `<b>${copy.method}:</b> ${escapeTelegramHtml(expensePaymentMethodLabel(payment?.payment_method, lang))}`,
  ]
  if (String(payment?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(payment.note)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(payment?.created_by_name || '-')}`
  )
  return lines.join('\n')
}

export function buildEmployeePaymentMessage(payment, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = COPY[lang]
  const employeeName = escapeTelegramHtml(payment?.employee_name || 'сотрудник')
  const lines = [
    `💵 <b>${copy.title}</b>`,
    '',
    `<b>${copy.greeting(employeeName)}</b>`,
    copy.recorded,
    '',
    `<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(payment?.amount)} UZS`,
    `<b>${copy.date}:</b> ${escapeTelegramHtml(formatDateOnly(payment?.paid_date, '-'))}`,
    `<b>${copy.method}:</b> ${escapeTelegramHtml(expensePaymentMethodLabel(payment?.payment_method, lang))}`,
  ]
  if (String(payment?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(payment.note)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(payment?.created_by_name || '-')}`
  )
  return lines.join('\n')
}
