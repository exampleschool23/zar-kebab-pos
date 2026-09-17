/** Split integer UZS without changing the saved tender total. */
export function getPaymentSplitAmounts(total, first) {
  const amount = String(first).trim()
  const firstAmount = /^\d+$/.test(amount) ? Number(amount) : NaN
  const savedTotal = Number(total)
  const valid = Number.isSafeInteger(savedTotal) && Number.isSafeInteger(firstAmount)
    && firstAmount > 0 && firstAmount < savedTotal
  return { valid, firstAmount, secondAmount: valid ? savedTotal - firstAmount : null }
}

/** Apply server-confirmed rows to a single order or a merged session drawer. */
export function applyPaymentSplit(order, result) {
  if (!order || !(order.id === result.orderId || order._mergedIds?.includes(result.orderId))) return order
  const payments = order._mergedIds?.length > 1
    ? [...(order.payments || []).filter(row => row.order_id !== result.orderId), ...result.payments]
    : result.payments
  const methods = [...new Set(payments.filter(row => row.method !== 'loyalty_card').map(row => row.method))]
  return { ...order, payments, payment_method: methods.length > 1 ? 'mixed' : methods[0] || result.payment_method }
}
