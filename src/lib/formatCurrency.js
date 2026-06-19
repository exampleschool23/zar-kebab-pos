import { formatDateOnly } from './dateFormat'

export function formatCurrency(amount) {
  return new Intl.NumberFormat('uz-UZ').format(amount) + ' UZS'
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return formatDateOnly(dateStr, dateStr)
}
