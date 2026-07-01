import { parseInstantDate } from './dateFormat.js'

export function getReliableOrderItemTime(item = {}, order = {}) {
  return [
    item.created_at,
    item.createdAt,
    item.submitted_at,
    item.submittedAt,
    order.created_at,
    order.createdAt,
  ].find(value => value && parseInstantDate(value)) || null
}

export function earliestReliableTime(values = []) {
  return values.filter(Boolean).reduce((earliest, value) => {
    const currentDate = parseInstantDate(value)
    if (!currentDate) return earliest
    const earliestDate = earliest ? parseInstantDate(earliest) : null
    return !earliestDate || currentDate < earliestDate ? value : earliest
  }, null)
}
