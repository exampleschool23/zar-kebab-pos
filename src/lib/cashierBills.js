import {
  getOrderPaymentSummary,
  isCancelledOrderItem,
} from './analytics.js'
import { inferOrderType, isDeliveryOrderType, isTakeAwayOrderType } from './orderTypes.js'

export function isTakeAwayBill(order) {
  return isTakeAwayOrderType(inferOrderType(order))
}

export function isDeliveryBill(order) {
  return isDeliveryOrderType(inferOrderType(order))
}

export function isOffPremiseBill(order) {
  return isTakeAwayBill(order) || isDeliveryBill(order)
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
