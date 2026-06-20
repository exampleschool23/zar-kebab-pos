function pad(value) {
  return String(value).padStart(2, '0')
}

export function parseDisplayDate(value, { dateOnly = false } = {}) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value)
  const normalized = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? `${raw}T12:00:00`
    : raw
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateOnly(value, fallback = '') {
  const date = parseDisplayDate(value, { dateOnly: true })
  if (!date) return fallback
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

const LONG_MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
}

export function normalizeDateLang(lang = 'en') {
  const normalized = String(lang || 'en').toLowerCase().split(/[-_]/)[0]
  return LONG_MONTHS[normalized] ? normalized : 'en'
}

export function formatLongDate(value, lang = 'en', fallback = '', { includeYear = true } = {}) {
  const date = parseDisplayDate(value, { dateOnly: true })
  if (!date) return fallback
  const months = LONG_MONTHS[normalizeDateLang(lang)]
  return includeYear
    ? `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
    : `${date.getDate()} ${months[date.getMonth()]}`
}

export function formatTime(value, fallback = '') {
  const date = parseDisplayDate(value)
  if (!date) return fallback
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateTime(value, fallback = '') {
  const date = parseDisplayDate(value)
  if (!date) return fallback
  return `${formatDateOnly(date)} ${formatTime(date)}`
}

export function formatLongDateTime(value, lang = 'en', fallback = '', { includeYear = true } = {}) {
  const date = parseDisplayDate(value)
  if (!date) return fallback
  return `${formatLongDate(date, lang, fallback, { includeYear })} ${formatTime(date)}`
}
