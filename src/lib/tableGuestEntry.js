import { PRICE_MODE_REGULAR, PRICE_MODES, normalizePriceMode } from './priceModes.js'

function activeOrderRows(tableId, orders = []) {
  return (Array.isArray(orders) ? orders : []).filter(order =>
    order?.table_id === tableId &&
    order?.payment_status !== 'paid' &&
    order?.status !== 'cancelled'
  )
}

export function getTableGuestEntryContext(tableId, orders = []) {
  const activeOrders = activeOrderRows(tableId, orders)
  const activeOrderIds = Array.from(new Set(activeOrders
    .map(order => String(order?.id || '').trim())
    .filter(Boolean)))
    .sort()
  const savedModes = Array.from(new Set(activeOrders.flatMap(order => {
    const explicitModes = [
      order?.price_mode ?? order?.priceMode,
      ...(Array.isArray(order?.items) ? order.items : []).map(item => item?.price_mode ?? item?.priceMode),
    ].filter(mode => PRICE_MODES.includes(mode))
    return explicitModes.length > 0 ? explicitModes : [PRICE_MODE_REGULAR]
  })))

  return {
    activeOrderIds,
    hasActiveOrders: activeOrders.length > 0,
    hasConflictingPriceModes: savedModes.length > 1,
    priceMode: normalizePriceMode(savedModes[0]),
    priceModeLocked: activeOrders.length > 0,
  }
}
