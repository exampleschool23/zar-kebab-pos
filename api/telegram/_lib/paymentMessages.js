import { expensePaymentMethodLabel } from '../../../src/lib/expenses.js'
import { formatDateOnly, formatLongDate } from '../../../src/lib/dateFormat.js'
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

const TEAM_EVENT_COPY = {
  uz: {
    bonusTitle: 'Xodim bonusi',
    fineTitle: 'Xodim jarimasi',
    absenceTitle: 'Xodim yo\u2018qligi',
    method: 'To\u2018lov turi',
    note: 'Izoh',
    reason: 'Sabab',
  },
  ru: {
    bonusTitle: 'Бонус сотруднику',
    fineTitle: 'Штраф сотрудника',
    absenceTitle: 'Отсутствие сотрудника',
    method: 'Способ оплаты',
    note: 'Примечание',
    reason: 'Причина',
  },
  en: {
    bonusTitle: 'Employee bonus',
    fineTitle: 'Employee fine',
    absenceTitle: 'Employee absence',
    method: 'Payment method',
    note: 'Note',
    reason: 'Reason',
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

const SALARY_RATE_COPY = {
  uz: {
    title: 'Maosh o\u2018zgarishi',
    raiseTitle: 'Ajoyib yangilik — maoshingiz oshdi!',
    greeting: name => `Assalomu alaykum, ${name}!`,
    employeeRecorded: 'Maoshingiz o\u2018zgartirildi.',
    raiseRecorded: 'Tabriklaymiz! Mehnatingiz qadrlanib, maoshingiz oshirildi. 🎉',
    raiseThanks: 'Zar Kebab jamoasiga qo\u2018shayotgan hissangiz uchun katta rahmat! Yangi yutuqlar sari birga davom etamiz. 🌟',
    groupRecorded: 'Xodimning maoshi o\u2018zgartirildi.',
    employee: 'Xodim',
    previousRate: 'Oldingi maosh',
    newRate: 'Yangi maosh',
    effectiveFrom: 'Amal qilish sanasi',
    note: 'Izoh',
    due: 'To\u2018lanishi kerak',
    createdBy: 'O\u2018zgartirdi',
    daily: 'kunlik',
    monthly: 'oylik',
  },
  ru: {
    title: 'Изменение зарплаты',
    raiseTitle: 'Отличная новость — ваша зарплата повышена!',
    greeting: name => `Здравствуйте, ${name}!`,
    employeeRecorded: 'Ваша ставка зарплаты изменена.',
    raiseRecorded: 'Поздравляем! Ваш труд и вклад в команду получили заслуженное признание. 🎉',
    raiseThanks: 'Спасибо, что развиваетесь вместе с Zar Kebab. Желаем новых успехов и достижений! 🌟',
    groupRecorded: 'Ставка зарплаты сотрудника изменена.',
    employee: 'Сотрудник',
    previousRate: 'Предыдущая зарплата',
    newRate: 'Новая зарплата',
    effectiveFrom: 'Действует с',
    note: 'Примечание',
    due: 'К выплате',
    createdBy: 'Изменил',
    daily: 'дневная',
    monthly: 'месячная',
  },
  en: {
    title: 'Salary change',
    raiseTitle: 'Great news — your salary has increased!',
    greeting: name => `Hello, ${name}!`,
    employeeRecorded: 'Your salary rate was changed.',
    raiseRecorded: 'Congratulations! Your hard work and contribution to the team have been recognized. 🎉',
    raiseThanks: 'Thank you for growing with Zar Kebab. Here\u2019s to even more success and achievements ahead! 🌟',
    groupRecorded: 'An employee salary rate was changed.',
    employee: 'Employee',
    previousRate: 'Previous salary',
    newRate: 'New salary',
    effectiveFrom: 'Effective from',
    note: 'Note',
    due: 'Salary due',
    createdBy: 'Changed by',
    daily: 'daily',
    monthly: 'monthly',
  },
}

function formatSalaryRate(rate, copy) {
  const unit = rate?.rate_unit === 'monthly' ? copy.monthly : copy.daily
  return `${formatSalaryNotificationAmount(rate?.amount)} UZS (${unit})`
}

function appendSalaryRateDetails(lines, rate, copy) {
  if (rate?.previous_rate?.amount) {
    lines.push(`<b>${copy.previousRate}:</b> ${escapeTelegramHtml(formatSalaryRate(rate.previous_rate, copy))}`)
  }
  lines.push(
    `<b>${copy.newRate}:</b> ${escapeTelegramHtml(formatSalaryRate(rate, copy))}`,
    `<b>${copy.effectiveFrom}:</b> ${escapeTelegramHtml(formatDateOnly(rate?.effective_from, '-'))}`
  )
  if (String(rate?.note || '').trim()) {
    lines.push(`<b>${copy.note}:</b> ${escapeTelegramHtml(rate.note)}`)
  }
}

export function buildSalaryRateGroupMessage(rate, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = SALARY_RATE_COPY[lang]
  const lines = [
    `📈 <b>${copy.title}</b>`,
    '',
    copy.groupRecorded,
    '',
    `<b>${copy.employee}:</b> ${escapeTelegramHtml(rate?.employee_name || '-')}`,
  ]
  appendSalaryRateDetails(lines, rate, copy)
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(rate?.created_by_name || '-')}`
  )
  return lines.join('\n')
}

export function buildEmployeeSalaryRateMessage(rate, remainingDue = 0, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = SALARY_RATE_COPY[lang]
  const employeeName = escapeTelegramHtml(rate?.employee_name || '-')
  const isIncrease = rate?.previous_rate?.rate_unit === rate?.rate_unit
    && Number(rate?.amount || 0) > Number(rate?.previous_rate?.amount || 0)
  const lines = [
    `${isIncrease ? '🎉' : '📈'} <b>${isIncrease ? copy.raiseTitle : copy.title}</b>`,
    '',
    `<b>${copy.greeting(employeeName)}</b>`,
    isIncrease ? copy.raiseRecorded : copy.employeeRecorded,
    '',
  ]
  appendSalaryRateDetails(lines, rate, copy)
  lines.push(
    `<b>${copy.due}:</b> ${formatSalaryNotificationAmount(remainingDue)} UZS`,
    `<b>${copy.createdBy}:</b> ${escapeTelegramHtml(rate?.created_by_name || '-')}`
  )
  if (isIncrease) {
    lines.push('', copy.raiseThanks)
  }
  return lines.join('\n')
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
  lines.push(`<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`)
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

export function buildSalaryTeamEventMessage(type, event, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = TEAM_EVENT_COPY[lang]
  const normalizedType = ['bonus', 'fine', 'absence'].includes(type) ? type : 'absence'
  const date = event?.bonus_date || event?.fine_date || event?.absence_date
  const detail = normalizedType === 'fine' ? event?.reason : event?.note
  if (normalizedType === 'absence') {
    const absenceCopy = TEAM_EVENT_COPY.ru
    const lines = [
      `📅 <b>${absenceCopy.absenceTitle}</b>`,
      `👤 <b>${escapeTelegramHtml(event?.employee_name || '-')}</b> · 🗓 ${escapeTelegramHtml(formatLongDate(date, 'ru', '-'))}`,
    ]
    if (String(detail || '').trim()) {
      lines.push(`📝 ${escapeTelegramHtml(String(detail).trim())}`)
    }
    return lines.join('\n')
  }
  const lines = [
    `${normalizedType === 'bonus' ? '🎁' : normalizedType === 'fine' ? '⚠️' : '📅'} <b>${copy[`${normalizedType}Title`]}</b>`,
    `👤 <b>${escapeTelegramHtml(event?.employee_name || '-')}</b> · <b>${formatSalaryNotificationAmount(event?.amount)} UZS</b>`,
  ]
  let dateLine = `🗓 ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`
  if (normalizedType === 'bonus') {
    dateLine += ` · ${escapeTelegramHtml(expensePaymentMethodLabel(event?.payment_method, lang))}`
  }
  lines.push(dateLine)
  if (String(detail || '').trim()) {
    const detailLabel = normalizedType === 'fine' ? copy.reason : copy.note
    lines.push(`📝 <b>${detailLabel}:</b> ${escapeTelegramHtml(String(detail).trim())}`)
  }
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
      `<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`
    )
  } else {
    lines.push(`<b>${copy.date}:</b> ${escapeTelegramHtml(formatLongDate(date, lang, '-'))}`)
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
