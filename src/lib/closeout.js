import { getOrderPaymentBreakdown, getOrderTotal, isPaidOrder, toLocalDateStr } from './analytics.js'

export function getDailyCloseout(orders = [], date = toLocalDateStr(new Date().toISOString())) {
  const paidOrders = orders.filter(order => isPaidOrder(order) && toLocalDateStr(order.paid_at || order.created_at) === date)
  const totals = {
    cash: 0,
    card: 0,
    terminal: 0,
    qr: 0,
    loyalty_card: 0,
    mixed: 0,
    other: 0,
  }
  let revenue = 0
  let loyaltyUsed = 0
  let cashbackIssued = 0

  for (const order of paidOrders) {
    revenue += getOrderTotal(order)
    loyaltyUsed += Number(order.loyalty_used_amount || order.loyalty_redeem_amount || 0) || 0
    cashbackIssued += Number(order.cashback_earned || 0) || 0
    const breakdown = getOrderPaymentBreakdown(order)
    if (breakdown.length === 0) {
      totals[order.payment_method || 'other'] = (totals[order.payment_method || 'other'] || 0) + getOrderTotal(order)
      continue
    }
    for (const payment of breakdown) {
      const key = totals[payment.method] == null ? 'other' : payment.method
      totals[key] += Number(payment.amount) || 0
    }
  }

  return {
    date,
    orderCount: paidOrders.length,
    revenue,
    totals,
    loyaltyUsed,
    cashbackIssued,
    cancelledCount: orders.filter(order => order.status === 'cancelled' && toLocalDateStr(order.updated_at || order.created_at) === date).length,
    variance: 0,
    notes: '',
  }
}

export function closeoutToCsv(closeout) {
  const rows = [
    ['Date', closeout.date],
    ['Paid orders', closeout.orderCount],
    ['Revenue', closeout.revenue],
    ['Cash', closeout.totals.cash],
    ['Card', closeout.totals.card],
    ['Terminal', closeout.totals.terminal],
    ['QR', closeout.totals.qr],
    ['Loyalty used', closeout.loyaltyUsed],
    ['Cashback issued', closeout.cashbackIssued],
    ['Cancelled orders', closeout.cancelledCount],
    ['Variance', closeout.variance],
    ['Notes', closeout.notes],
  ]
  return rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
}

export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined') return
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
