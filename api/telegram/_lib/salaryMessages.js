import {
  expensePaymentMethodLabel,
  getSalaryAccruedAmount,
  getSalaryAbsenceForDate,
  getSalaryBalance,
  normalizeExpenseAmount,
} from '../../../src/lib/expenses.js'
import { formatDateOnly, formatLongDate } from '../../../src/lib/dateFormat.js'
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
    groupTitle: 'Kunlik umumiy maosh va KPI hisoboti',
    groupCafeIncome: 'Kunlik kafe daromadi',
    groupDineInShare: 'Oddiy zaldagi savdo ulushi',
    groupOffPremiseShare: 'Oddiy olib ketish + yetkazib berish ulushi',
    groupTouristShare: 'Turist savdolari ulushi',
    groupCafeNetProfit: 'Kafening sof foydasi',
    groupSalary: 'Hisoblangan umumiy maosh',
    groupKpi: 'Avtomatik KPI bonuslari',
    groupTotal: 'Umumiy summa',
    groupRent: 'Ijara',
    groupUtilities: 'Kommunal xarajatlar',
    groupEmployeeMeals: 'Xodimlar ovqatining o‘rtacha qiymati',
    groupNetProfit: 'Kunlik sof foyda',
    unavailable: 'Mavjud emas',
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
    groupTitle: 'Общий отчёт по зарплате и KPI',
    groupCafeIncome: 'Выручка кафе за день',
    groupDineInShare: 'Доля обычной выручки в зале',
    groupOffPremiseShare: 'Доля обычной выручки с собой + доставка',
    groupTouristShare: 'Доля туристической выручки',
    groupCafeNetProfit: 'Чистая прибыль кафе',
    groupSalary: 'Начисленная зарплата',
    groupKpi: 'Автоматические KPI-бонусы',
    groupTotal: 'Общая сумма',
    groupRent: 'Аренда',
    groupUtilities: 'Коммуналка',
    groupEmployeeMeals: 'Среднее питание сотрудников',
    groupNetProfit: 'Чистая прибыль за день',
    unavailable: 'Недоступно',
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
    groupTitle: 'Daily salary and KPI totals',
    groupCafeIncome: 'Daily cafe income',
    groupDineInShare: 'Regular dine-in revenue share',
    groupOffPremiseShare: 'Regular take-away + delivery revenue share',
    groupTouristShare: 'Tourist revenue share',
    groupCafeNetProfit: 'Cafe net profit',
    groupSalary: 'Salary earned',
    groupKpi: 'Automatic KPI bonuses',
    groupTotal: 'Combined total',
    groupRent: 'Rent',
    groupUtilities: 'Utilities',
    groupEmployeeMeals: 'Avg employees meal',
    groupNetProfit: 'Daily net profit',
    unavailable: 'Unavailable',
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

function formatSalaryNotificationPercent(value, language) {
  const locale = language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU'
  const percentage = Number.isFinite(Number(value)) ? Number(value) : 0
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percentage)}%`
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

export function getDailyPayrollGroupSummary(salaryProfiles, kpiResults, date, {
  cafeIncome = 0,
  regularDineInIncome = 0,
  regularOffPremiseIncome = 0,
  touristIncome = 0,
  grossProfit = null,
  rent = 0,
  utilities = 0,
  employeeMealPerEmployee = 0,
} = {}) {
  const profiles = Array.isArray(salaryProfiles) ? salaryProfiles : []
  const results = Array.isArray(kpiResults) ? kpiResults : []
  const salaryTotal = profiles.reduce(
    (total, salaryProfile) => total + getSalaryAccruedAmount(salaryProfile, date, date),
    0
  )
  const kpiBonusTotal = results
    .filter(result => result?.status === 'generated')
    .reduce((total, result) => total + normalizeExpenseAmount(result?.bonus_amount), 0)
  const rentTotal = normalizeExpenseAmount(rent)
  const utilitiesTotal = normalizeExpenseAmount(utilities)
  const presentEmployeeCount = profiles.filter(profile => !getSalaryAbsenceForDate(profile, date)).length
  const employeeMealPerEmployeeTotal = normalizeExpenseAmount(employeeMealPerEmployee)
  const employeeMealTotal = employeeMealPerEmployeeTotal * presentEmployeeCount
  const normalizedGrossProfit = Number.isFinite(Number(grossProfit))
    ? Math.round(Number(grossProfit))
    : null
  const cafeIncomeTotal = normalizeExpenseAmount(cafeIncome)
  const dineInIncomeTotal = normalizeExpenseAmount(regularDineInIncome)
  const offPremiseIncomeTotal = normalizeExpenseAmount(regularOffPremiseIncome)
  const touristIncomeTotal = normalizeExpenseAmount(touristIncome)
  const classifiedIncomeTotal = dineInIncomeTotal + offPremiseIncomeTotal + touristIncomeTotal
  const dineInPercentage = classifiedIncomeTotal > 0
    ? Math.round((dineInIncomeTotal / classifiedIncomeTotal) * 1000) / 10
    : 0
  const offPremisePercentage = classifiedIncomeTotal > 0
    ? Math.round((offPremiseIncomeTotal / classifiedIncomeTotal) * 1000) / 10
    : 0
  const touristPercentage = classifiedIncomeTotal > 0
    ? Math.round((100 - dineInPercentage - offPremisePercentage) * 10) / 10
    : 0

  return {
    date,
    cafeIncomeTotal,
    dineInPercentage,
    offPremisePercentage,
    touristPercentage,
    cafeNetProfit: normalizedGrossProfit,
    salaryTotal,
    kpiBonusTotal,
    combinedTotal: salaryTotal + kpiBonusTotal,
    rentTotal,
    utilitiesTotal,
    presentEmployeeCount,
    employeeMealPerEmployeeTotal,
    employeeMealTotal,
    netProfit: normalizedGrossProfit == null
      ? null
      : normalizedGrossProfit - salaryTotal - kpiBonusTotal - rentTotal - utilitiesTotal - employeeMealTotal,
  }
}

export function buildDailyPayrollGroupMessage(summary, date, language = 'ru') {
  const lang = normalizeSalaryNotificationLanguage(language)
  const copy = COPY[lang]
  const salaryTotal = normalizeExpenseAmount(summary?.salaryTotal)
  const kpiBonusTotal = normalizeExpenseAmount(summary?.kpiBonusTotal)
  const combinedTotal = salaryTotal + kpiBonusTotal
  const rentTotal = normalizeExpenseAmount(summary?.rentTotal)
  const utilitiesTotal = normalizeExpenseAmount(summary?.utilitiesTotal)
  const employeeMealTotal = normalizeExpenseAmount(summary?.employeeMealTotal)
  const employeeMealPerEmployeeTotal = normalizeExpenseAmount(summary?.employeeMealPerEmployeeTotal)
  const presentEmployeeCount = normalizeExpenseAmount(summary?.presentEmployeeCount)
  const cafeIncomeTotal = normalizeExpenseAmount(summary?.cafeIncomeTotal)
  const dineInPercentage = Number(summary?.dineInPercentage) || 0
  const offPremisePercentage = Number(summary?.offPremisePercentage) || 0
  const touristPercentage = Number(summary?.touristPercentage) || 0
  const cafeNetProfit = Number.isFinite(Number(summary?.cafeNetProfit))
    ? Math.round(Number(summary.cafeNetProfit))
    : null
  const netProfit = Number.isFinite(Number(summary?.netProfit))
    ? Math.round(Number(summary.netProfit))
    : null
  const compactRussianDate = formatLongDate(date, 'ru', date, { includeYear: false })
    .replace(/\s+/, '-')

  return [
    `💼 <b>${copy.groupTitle}</b>`,
    `📅 ${escapeTelegramHtml(compactRussianDate)}`,
    '',
    `<b>${copy.groupCafeIncome}:</b> ${formatSalaryNotificationAmount(cafeIncomeTotal)} ${copy.currency}`,
    `<b>${copy.groupDineInShare}:</b> ${formatSalaryNotificationPercent(dineInPercentage, lang)}`,
    `<b>${copy.groupOffPremiseShare}:</b> ${formatSalaryNotificationPercent(offPremisePercentage, lang)}`,
    `<b>${copy.groupTouristShare}:</b> ${formatSalaryNotificationPercent(touristPercentage, lang)}`,
    `<b>${copy.groupCafeNetProfit}:</b> ${cafeNetProfit == null
      ? copy.unavailable
      : `${formatSalaryNotificationAmount(cafeNetProfit)} ${copy.currency}`}`,
    '',
    `<b>${copy.groupSalary}:</b> ${formatSalaryNotificationAmount(salaryTotal)} ${copy.currency}`,
    `<b>${copy.groupKpi}:</b> ${formatSalaryNotificationAmount(kpiBonusTotal)} ${copy.currency}`,
    `<b>${copy.groupTotal}:</b> ${formatSalaryNotificationAmount(combinedTotal)} ${copy.currency}`,
    `<b>${copy.groupRent}:</b> ${formatSalaryNotificationAmount(rentTotal)} ${copy.currency}`,
    `<b>${copy.groupUtilities}:</b> ${formatSalaryNotificationAmount(utilitiesTotal)} ${copy.currency}`,
    `<b>${copy.groupEmployeeMeals} (${presentEmployeeCount} × ${formatSalaryNotificationAmount(employeeMealPerEmployeeTotal)}):</b> ${formatSalaryNotificationAmount(employeeMealTotal)} ${copy.currency}`,
    '',
    `<b>${copy.groupNetProfit}:</b> ${netProfit == null
      ? copy.unavailable
      : `${formatSalaryNotificationAmount(netProfit)} ${copy.currency}`}`,
  ].join('\n').trim()
}

export function parseEmployeeStartToken(text) {
  const match = String(text || '').trim().match(/^\/start(?:@\w+)?\s+employee_([0-9a-f-]{36})$/i)
  return match?.[1]?.toLowerCase() || ''
}
