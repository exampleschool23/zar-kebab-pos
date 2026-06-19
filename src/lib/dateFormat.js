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
