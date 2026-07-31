import { getOrderRevenueTotal, getSoldOrderItems } from './analytics.js'

function normalizedCost(value) {
  if (value == null || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, amount) : null
}

export function getSaleProfitSummary(price, cost) {
  const sellingPrice = Number(price)
  const realCost = Number(cost)
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0 || !Number.isFinite(realCost) || realCost < 0) return null
  const profit = sellingPrice - realCost
  return {
    profit: Math.round(profit),
    marginPct: Math.round((profit / sellingPrice) * 1000) / 10,
    markupPct: realCost > 0 ? Math.round((profit / realCost) * 1000) / 10 : null,
  }
}

export function getOrderItemCostPrice(item) {
  const snapshotCost = normalizedCost(
    item?.cost_price ?? item?.costPrice ?? item?.real_cost ?? item?.realCost
  )
  return snapshotCost ?? 0
}

export function hasOrdersCostCoverage(orders) {
  return (orders || []).every(order => getSoldOrderItems(order).every(item => {
    return normalizedCost(
      item?.cost_price ?? item?.costPrice ?? item?.real_cost ?? item?.realCost
    ) != null
  }))
}

export function getOrderCostTotal(order, menuItemMap = null) {
  return Math.round(getSoldOrderItems(order).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item?.quantity) || 1)
    return sum + getOrderItemCostPrice(item) * quantity
  }, 0))
}

export function getOrderNetProfit(order, menuItemMap = null) {
  return Math.round(getOrderRevenueTotal(order) - getOrderCostTotal(order, menuItemMap))
}

export function getOrderProfitMarginPct(order, menuItemMap = null) {
  const revenue = getOrderRevenueTotal(order)
  return getSaleProfitSummary(revenue, getOrderCostTotal(order, menuItemMap))?.marginPct ?? null
}

export function getOrdersCostTotal(orders, menuItemMap = null) {
  return Math.round((orders || []).reduce(
    (sum, order) => sum + getOrderCostTotal(order, menuItemMap),
    0
  ))
}

export function getOrdersNetProfit(orders, menuItemMap = null) {
  return Math.round((orders || []).reduce(
    (sum, order) => sum + getOrderNetProfit(order, menuItemMap),
    0
  ))
}
