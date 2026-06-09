import { getReservationSummary, isReservedTable } from './tableManagement.js'

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function eventTime(...values) {
  for (const value of values) {
    const date = asDate(value)
    if (date) return date.toISOString()
  }
  return null
}

export function getTodaysReservations(tables = [], now = new Date()) {
  const today = asDate(now) || new Date()
  return tables
    .filter(table => isReservedTable(table))
    .map(table => ({ table, reservation: getReservationSummary(table) }))
    .filter(({ reservation }) => {
      const startsAt = asDate(reservation?.startsAt)
      return startsAt && sameLocalDay(startsAt, today)
    })
    .sort((a, b) => asDate(a.reservation.startsAt) - asDate(b.reservation.startsAt))
}

export function clearReservationPatch(table, status = 'available') {
  return {
    ...table,
    status,
    reserved_for_name: '',
    reserved_for_phone: '',
    reserved_at: null,
    reserved_until: null,
    reservation_notes: '',
  }
}

export function getTableActivityTimeline(table, orders = []) {
  const tableOrders = orders
    .filter(order => order.table_id === table?.id)
    .sort((a, b) => (asDate(a.created_at) || 0) - (asDate(b.created_at) || 0))

  const events = []
  const push = (key, label, at, tone = 'gray') => {
    if (!at) return
    if (events.some(event => event.key === key)) return
    events.push({ key, label, at, tone })
  }

  if (isReservedTable(table)) {
    push('reserved', 'Reserved', eventTime(table.reserved_at, table.updated_at, table.created_at), 'purple')
  }

  const firstOrder = tableOrders[0]
  push('seated', 'Seated', eventTime(firstOrder?.created_at), 'indigo')

  const sentOrder = tableOrders.find(order => ['sent_to_kitchen', 'preparing', 'delivered', 'needs_bill', 'paid'].includes(order.status))
  push('sent_to_kitchen', 'Order sent', eventTime(sentOrder?.sent_at, sentOrder?.created_at), 'orange')

  const allItems = tableOrders.flatMap(order => order.items || [])
  const readyItem = allItems.find(item => item.status === 'ready' || item.status === 'served')
  push('ready', 'Ready', eventTime(readyItem?.updated_at, readyItem?.created_at, readyItem?.id), 'blue')

  const servedOrder = tableOrders.find(order => order.status === 'delivered' || (order.items || []).some(item => item.status === 'served'))
  push('served', 'Served', eventTime(servedOrder?.delivered_at, servedOrder?.updated_at, servedOrder?.created_at), 'green')

  const billOrder = tableOrders.find(order => order.status === 'needs_bill')
  if (table?.status === 'needs_bill' || billOrder) {
    push('bill_requested', 'Bill requested', eventTime(billOrder?.updated_at, billOrder?.created_at, table?.updated_at), 'red')
  }

  const paidOrder = tableOrders.find(order => order.payment_status === 'paid' || order.status === 'paid')
  push('paid', 'Paid', eventTime(paidOrder?.paid_at, paidOrder?.updated_at, paidOrder?.created_at), 'emerald')

  return events.sort((a, b) => asDate(a.at) - asDate(b.at))
}

export function compactTimelineLabels(table, orders = [], limit = 4) {
  return getTableActivityTimeline(table, orders)
    .slice(-limit)
    .map(event => event.label)
}
