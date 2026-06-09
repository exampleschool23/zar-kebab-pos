import {
  getOrderPaymentSummary,
  isCancelledOrderItem,
} from './analytics.js'

export function isTakeAwayBill(order) {
  return order?.order_type === 'take_away' ||
    (!order?.table_id && String(order?.table_name || '').toLowerCase().includes('take'))
}

export function getCashierBillableItems(order) {
  return (order?.items || []).filter(item => !isCancelledOrderItem(item))
}

export function isCashierVisibleBill(order) {
  if (!order || order.payment_status === 'paid' || order.status === 'cancelled') return false
  const billableItems = getCashierBillableItems(order)
  if (billableItems.length === 0) return false
  return getOrderPaymentSummary(order, billableItems, order.service_rate_pct).total > 0
}
