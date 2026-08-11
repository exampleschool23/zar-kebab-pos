import {
  getOrderLoyaltyIncomeTotal,
  getOrderPaymentBreakdown,
  getOrderRevenueTotal,
  groupOrdersBySession,
  isPaidOrder,
  toLocalDateStr,
} from './analytics.js'

export function getDailyCloseout(
  orders = [],
  dateFrom = toLocalDateStr(new Date().toISOString()),
  dateTo = dateFrom,
  { tableId = 'all', waiterName = 'all' } = {},
) {
  const from = dateFrom || toLocalDateStr(new Date().toISOString())
  const to = dateTo || from
  const matchesCloseoutRange = value => {
    const date = toLocalDateStr(value)
    return !!date && date >= from && date <= to
  }
  const matchesSelectedScope = order => (
    (tableId === 'all' || order.table_id === tableId) &&
    (waiterName === 'all' || order.waiter_name === waiterName)
  )
  const paidOrders = groupOrdersBySession(orders).filter(order => (
    isPaidOrder(order) &&
    matchesCloseoutRange(order.paid_at || order.created_at) &&
    matchesSelectedScope(order)
  ))
  const totals = {
    cash: 0,
    card: 0,
    terminal: 0,
    loyalty_card: 0,
    mixed: 0,
    other: 0,
  }
  let revenue = 0
  let loyaltyIncome = 0
  let cashbackIssued = 0

  for (const order of paidOrders) {
    revenue += getOrderRevenueTotal(order)
    loyaltyIncome += getOrderLoyaltyIncomeTotal(order)
    cashbackIssued += Number(order.cashback_earned || 0) || 0
    const breakdown = getOrderPaymentBreakdown(order)
    if (breakdown.length === 0) {
      totals[order.payment_method || 'other'] = (totals[order.payment_method || 'other'] || 0) + getOrderRevenueTotal(order)
      continue
    }
    for (const payment of breakdown) {
      const key = totals[payment.method] == null ? 'other' : payment.method
      totals[key] += Number(payment.amount) || 0
    }
  }

  return {
    date: to,
    dateFrom: from,
    dateTo: to,
    orderCount: paidOrders.length,
    revenue,
    totals,
    loyaltyIncome,
    loyaltyUsed: loyaltyIncome,
    cashbackIssued,
    cancelledCount: orders.filter(order => (
      order.status === 'cancelled' &&
      matchesCloseoutRange(order.updated_at || order.created_at) &&
      matchesSelectedScope(order)
    )).length,
    variance: 0,
    notes: '',
  }
}

export function closeoutToCsv(closeout) {
  const dateFrom = closeout.dateFrom || closeout.date
  const dateTo = closeout.dateTo || closeout.date
  const dateRows = dateFrom && dateTo && dateFrom !== dateTo
    ? [['Date range', `${dateFrom} – ${dateTo}`]]
    : [['Date', closeout.date || dateFrom || dateTo]]
  const rows = [
    ...dateRows,
    ['Paid orders', closeout.orderCount],
    ['Revenue', closeout.revenue],
    ['Cash', closeout.totals.cash],
    ['Card', closeout.totals.card],
    ['Terminal', closeout.totals.terminal],
    ['Loyalty income', closeout.loyaltyIncome ?? closeout.loyaltyUsed],
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
