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

const GROUP_EVENT_COPY = {
  uz: {
    bonus: 'Xodim bonusi',
    fine: 'Xodim jarimasi',
    absence: 'Xodim yo‘qligi',
    employee: 'Xodim',
    amount: 'Summa',
    date: 'Sana',
    method: 'To‘lov turi',
    note: 'Izoh',
    reason: 'Sabab',
    due: 'To‘lanishi kerak',
    createdBy: 'Rasmiylashtirdi',
  },
  ru: {
    bonus: 'Бонус сотруднику',
    fine: 'Штраф сотрудника',
    absence: 'Отсутствие сотрудника',
    employee: 'Сотрудник',
    amount: 'Сумма',
    date: 'Дата',
    method: 'Способ оплаты',
    note: 'Примечание',
    reason: 'Причина',
    due: 'К выплате',
    createdBy: 'Оформил',
  },
  en: {
    bonus: 'Employee bonus',
    fine: 'Employee fine',
    absence: 'Employee absence',
    employee: 'Employee',
    amount: 'Amount',
    date: 'Date',
    method: 'Payment method',
    note: 'Note',
    reason: 'Reason',
    due: 'Salary due',
    createdBy: 'Recorded by',
  },
}

const EMPLOYEE_EVENT_COPY = {
  uz: {
    greeting: name => `Assalomu alaykum, ${name}!`,
    bonusRecorded: 'Sizga bonus hisoblandi.',
    absenceRecorded: 'Sizning yo‘qligingiz qayd etildi.',
  },
  ru: {
    greeting: name => `Здравствуйте, ${name}!`,
    bonusRecorded: 'Вам начислен бонус.',
    absenceRecorded: 'Ваше отсутствие зарегистрировано.',
  },
  en: {
    greeting: name => `Hello, ${name}!`,
    bonusRecorded: 'A bonus was recorded for you.',
    absenceRecorded: 'Your absence was recorded.',
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

export function buildSalaryGroupEventMessage(type, event, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = GROUP_EVENT_COPY[lang]
  const normalizedType = ['bonus', 'fine', 'absence'].includes(type) ? type : 'absence'
  const date = event?.bonus_date || event?.fine_date || event?.absence_date
  const lines = [
    `${normalizedType === 'bonus' ? '🎁' : normalizedType === 'fine' ? '⚠️' : '📅'} <b>${copy[normalizedType]}</b>`,
    '',
    `<b>${copy.employee}:</b> ${escapeTelegramHtml(event?.employee_name || '-')}`,
  ]
  if (normalizedType !== 'absence') {
    lines.push(`<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(event?.amount)} UZS`)
  }
  lines.push(`<b>${copy.date}:</b> ${escapeTelegramHtml(formatDateOnly(date, '-'))}`)
  if (normalizedType === 'bonus') {
    lines.push(`<b>${copy.method}:</b> ${escapeTelegramHtml(expensePaymentMethodLabel(event?.payment_method, lang))}`)
  }
  const detail = normalizedType === 'fine' ? event?.reason : event?.note
  if (String(detail || '').trim()) {
    lines.push(`<b>${normalizedType === 'fine' ? copy.reason : copy.note}:</b> ${escapeTelegramHtml(detail)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(event?.created_by_name || '-')}`
  )
  return lines.join('\n')
}

export function buildEmployeeSalaryEventMessage(type, event, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = GROUP_EVENT_COPY[lang]
  const employeeCopy = EMPLOYEE_EVENT_COPY[lang]
  const normalizedType = type === 'bonus' ? 'bonus' : 'absence'
  const date = normalizedType === 'bonus' ? event?.bonus_date : event?.absence_date
  const employeeName = escapeTelegramHtml(event?.employee_name || '-')
  const lines = [
    `${normalizedType === 'bonus' ? '🎁' : '📅'} <b>${copy[normalizedType]}</b>`,
    '',
    `<b>${employeeCopy.greeting(employeeName)}</b>`,
    normalizedType === 'bonus' ? employeeCopy.bonusRecorded : employeeCopy.absenceRecorded,
    '',
  ]
  if (normalizedType === 'bonus') {
    lines.push(
      `<b>${copy.amount}:</b> ${formatSalaryNotificationAmount(event?.amount)} UZS`,
      `<b>${copy.date}:</b> ${escapeTelegramHtml(formatDateOnly(date, '-'))}`,
      `<b>${copy.method}:</b> ${escapeTelegramHtml(expensePaymentMethodLabel(event?.payment_method, lang))}`
    )
  } else {
    lines.push(`<b>${copy.date}:</b> ${escapeTelegramHtml(formatDateOnly(date, '-'))}`)
  }
  if (String(event?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(event.note)}`)
  }
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(event?.created_by_name || '-')}`
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
