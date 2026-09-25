import {
  getOrderPaymentSummary,
  isCancelledOrderItem,
  isPaidOrder,
} from './analytics.js'
import { inferOrderType, isOffPremiseOrderType, isDeliveryOrderType, isTakeAwayOrderType } from './orderTypes.js'

export function isTakeAwayBill(order) {
  return isTakeAwayOrderType(inferOrderType(order))
}

export function isDeliveryBill(order) {
  return isDeliveryOrderType(inferOrderType(order))
}

export function isOffPremiseBill(order) {
  return isOffPremiseOrderType(inferOrderType(order))
}

export function getCashierBillableItems(order) {
  return (order?.items || []).filter(item => !isCancelledOrderItem(item))
}

export function isCashierVisibleBill(order) {
  if (!order || order.payment_status === 'paid' || order.status === 'cancelled') return false
  if (!isOffPremiseBill(order) && order.status !== 'needs_bill') return false
  const billableItems = getCashierBillableItems(order)
  if (billableItems.length === 0) return false
  return getOrderPaymentSummary(order, billableItems, order.service_rate_pct).total > 0
}

// Recovery candidates only; empty shells must never become payable bills.
export function getEmptyCashierOrders(orders = [], { tableId, orderId } = {}) {
  if (!tableId && !orderId) return []
  return orders.filter(order =>
    (orderId ? order.id === orderId : order.table_id === tableId) &&
    !isPaidOrder(order) && order.status !== 'cancelled' && order.payment_status !== 'cancelled' &&
    Array.isArray(order.items) && getCashierBillableItems(order).length === 0
  )
}
