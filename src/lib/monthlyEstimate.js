import { getOrderPaymentBreakdown, normalizePaymentMethod } from './analytics.js'
import { normalizeExpenseAmount } from './expenses.js'

export const MONTHLY_ESTIMATE_PAYMENT_METHODS = ['cash', 'card', 'terminal', 'qr', 'loyalty_card']

function addAmount(map, method, amount) {
  const key = normalizePaymentMethod(method)
  map[key] = (map[key] || 0) + normalizeExpenseAmount(amount)
}

export function getMonthlyEstimateMethodRows(
  paidOrders = [],
  incomeEntries = [],
  expenseEntries = []
) {
  const inflow = {}
  const outflow = {}

  for (const order of paidOrders || []) {
    for (const payment of getOrderPaymentBreakdown(order)) {
      addAmount(inflow, payment.method, payment.amount)
    }
  }
  for (const income of incomeEntries || []) {
    addAmount(inflow, income?.payment_method || 'cash', income?.amount)
  }
  for (const expense of expenseEntries || []) {
    addAmount(outflow, expense?.payment_method || 'cash', expense?.amount)
  }

  return MONTHLY_ESTIMATE_PAYMENT_METHODS
    .map(method => ({
      method,
      inflow: inflow[method] || 0,
      outflow: outflow[method] || 0,
    }))
    .filter(row => row.inflow > 0 || row.outflow > 0)
}
