import { formatDateOnly } from './dateFormat.js'

export function formatCurrency(amount) {
  return new Intl.NumberFormat('uz-UZ').format(amount) + ' UZS'
}

export function formatCurrencyWithPercentage(amount, percentage, lang = 'uz') {
  const currency = formatCurrency(amount)
  if (percentage == null || percentage === '') return currency
  const numericPercentage = Number(percentage)
  if (!Number.isFinite(numericPercentage)) return currency

  const locale = lang === 'en' ? 'en-US' : lang === 'ru' ? 'ru-RU' : 'uz-UZ'
  const formattedPercentage = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    .format(numericPercentage)
  return `${currency} · ${formattedPercentage}%`
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return formatDateOnly(dateStr, dateStr)
}
