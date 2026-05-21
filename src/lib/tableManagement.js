export function hasActiveOrders(tableId, orders = []) {
  return orders.some(order =>
    order.table_id === tableId &&
    order.payment_status !== 'paid' &&
    order.status !== 'cancelled'
  )
}

export function hasOrderHistory(tableId, orders = []) {
  return orders.some(order => order.table_id === tableId)
}

export function canDisableTable(table, orders = []) {
  if (!table || table.is_active === false) return { ok: false, reason: 'already_disabled' }
  if (hasActiveOrders(table.id, orders)) return { ok: false, reason: 'active_orders' }
  return { ok: true, reason: null }
}

export function canDeleteTable(table, orders = []) {
  if (!table) return { ok: false, reason: 'missing_table' }
  if (hasActiveOrders(table.id, orders)) return { ok: false, reason: 'active_orders' }
  if (hasOrderHistory(table.id, orders)) return { ok: false, reason: 'order_history' }
  return { ok: true, reason: null }
}

export function isReservedTable(table) {
  return table?.is_active !== false && table?.status === 'reserved'
}

export function getReservationSummary(table) {
  if (!isReservedTable(table)) return null
  return {
    name: table.reserved_for_name || '',
    phone: table.reserved_for_phone || '',
    startsAt: table.reserved_at || '',
    endsAt: table.reserved_until || '',
    notes: table.reservation_notes || '',
  }
}

export function getWaiterTableStatus(table, activeOrders, deriveActiveStatus) {
  if (activeOrders.length === 0 && isReservedTable(table)) return 'reserved'
  return deriveActiveStatus()
}
