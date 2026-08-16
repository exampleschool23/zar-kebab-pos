import { getOrderPaymentSummary, isCancelledOrderItem } from './analytics.js'
import { isCashierQuickItem } from './menuItems.js'
import { inferOrderType, isOffPremiseOrderType } from './orderTypes.js'
import { getConfiguredServiceRatePct } from './serviceRates.js'

function isOpenSettlementOrder(order) {
  return order &&
    order.payment_status !== 'paid' &&
    !order.paid_at &&
    !['paid', 'completed', 'cancelled'].includes(String(order.status || '').toLowerCase())
}

/**
 * Recompute the cashier target from freshly loaded order rows using the same
 * per-order snapshots that the atomic database settlement uses.
 */
export function getFreshCashierPaymentQuote({
  orders = [],
  menuItems = [],
  settings = {},
  tableId = null,
  orderId = null,
  loyaltyUsedAmount = 0,
} = {}) {
  const menuById = new Map(menuItems.map(item => [item.id, item]))
  const targets = orders.filter(order => (
    (orderId ? order.id === orderId : order.table_id === tableId) &&
    isOpenSettlementOrder(order)
  ))

  let subtotal = 0
  let serviceFee = 0
  let grossAmount = 0

  for (const order of targets) {
    const orderType = inferOrderType(order)
    const fallbackServiceRatePct = getConfiguredServiceRatePct(settings, order.price_mode)
    const serviceRatePct = isOffPremiseOrderType(orderType)
      ? 0
      : Number.isFinite(Number(order.service_rate_pct))
        ? Number(order.service_rate_pct)
        : fallbackServiceRatePct
    const items = (order.items || order.order_items || [])
      .filter(item => !isCancelledOrderItem(item))
      .map(item => {
        const menuItem = menuById.get(item.menu_item_id)
        const isCounter = isCashierQuickItem(menuItem) || item.is_counter_item || item.isCounterItem
        return isCounter
          ? { ...item, item_type: item.item_type || item.itemType || 'counter', is_counter_item: true }
          : item
      })
    const summary = getOrderPaymentSummary(
      { ...order, order_type: orderType, service_rate_pct: serviceRatePct, loyalty_used_amount: 0 },
      items,
      fallbackServiceRatePct
    )
    subtotal += summary.subtotal
    serviceFee += summary.serviceFee
    grossAmount += summary.grossAmount
  }

  const loyalty = Math.min(
    grossAmount,
    Math.max(0, Math.round(Number(loyaltyUsedAmount) || 0))
  )

  return {
    orderIds: targets.map(order => order.id),
    subtotal,
    serviceFee,
    grossAmount,
    loyaltyUsedAmount: loyalty,
    total: Math.max(0, grossAmount - loyalty),
  }
}

export function canConfirmCashierCheckout({
  canEditCashier,
  paymentValidation,
  loyaltyReady,
  grossAmount,
  loyaltyUsedAmount,
  isProcessingPayment,
  isRefreshingBill,
} = {}) {
  const gross = Math.max(0, Math.round(Number(grossAmount) || 0))
  const loyalty = Math.max(0, Math.round(Number(loyaltyUsedAmount) || 0))
  const loyaltyOnly = gross > 0 && loyalty >= gross && Number(paymentValidation?.totalAmount) === 0

  return !!(
    canEditCashier &&
    loyaltyReady &&
    (paymentValidation?.canConfirmPayment || loyaltyOnly) &&
    !isProcessingPayment &&
    !isRefreshingBill
  )
}
