import { getOrderRevenueTotal, getSoldOrderItems } from './analytics.js'

function menuItemFor(menuItemMap, menuItemId) {
  if (!menuItemMap || !menuItemId) return null
  if (menuItemMap instanceof Map) return menuItemMap.get(menuItemId) || null
  return menuItemMap[menuItemId] || null
}

function normalizedCost(value) {
  if (value == null || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, amount) : null
}

export function getOrderItemCostPrice(item, menuItemMap = null) {
  const snapshotCost = normalizedCost(
    item?.cost_price ?? item?.costPrice ?? item?.real_cost ?? item?.realCost
  )
  if (snapshotCost != null) return snapshotCost

  const menuItem = menuItemFor(menuItemMap, item?.menu_item_id ?? item?.menuItemId)
  return normalizedCost(
    menuItem?.cost_price ?? menuItem?.costPrice ?? menuItem?.real_cost ?? menuItem?.realCost
  ) || 0
}

export function getOrderCostTotal(order, menuItemMap = null) {
  return Math.round(getSoldOrderItems(order).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item?.quantity) || 1)
    return sum + getOrderItemCostPrice(item, menuItemMap) * quantity
  }, 0))
}

export function getOrderNetProfit(order, menuItemMap = null) {
  return Math.round(getOrderRevenueTotal(order) - getOrderCostTotal(order, menuItemMap))
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
