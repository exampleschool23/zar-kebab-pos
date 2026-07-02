import {
  getOrderDate,
  getOrderItemProductId,
  getOrderItems,
  getRestaurantHour,
  isCancelledOrderItem,
  toLocalDateStr,
} from './analytics.js'
import { getOrderItemUnitPrice } from './priceModes.js'
import { inferOrderType } from './orderTypes.js'

export const ALL_DISHES_KEY = 'all'

function cleanText(value) {
  return String(value ?? '').trim()
}

function normalizeNameKey(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ')
}

function positiveQuantity(value) {
  const qty = Number(value)
  return Number.isFinite(qty) && qty > 0 ? qty : 1
}

function compareInstant(a, b) {
  const timeA = Date.parse(a || '')
  const timeB = Date.parse(b || '')
  if (!Number.isFinite(timeA) && !Number.isFinite(timeB)) return 0
  if (!Number.isFinite(timeA)) return -1
  if (!Number.isFinite(timeB)) return 1
  return timeA - timeB
}

export function getMenuDishSalesKey(item) {
  if (item?.id != null && cleanText(item.id)) return `menu:${item.id}`
  const name = cleanText(item?.name_en || item?.name_uz || item?.name_ru || item?.name)
  return name ? `name:${normalizeNameKey(name)}` : null
}

export function getOrderItemDishSalesKey(item) {
  const productId = getOrderItemProductId(item)
  if (productId != null && cleanText(productId)) return `menu:${productId}`
  const name = cleanText(item?.name)
  return name ? `name:${normalizeNameKey(name)}` : null
}

function getMenuDishName(item) {
  return cleanText(item?.name_en || item?.name_uz || item?.name_ru || item?.name || item?.id || 'Unknown')
}

function getOrderItemDishName(item) {
  return cleanText(item?.name || item?.name_en || item?.name_uz || item?.name_ru || 'Unknown')
}

function createDishRowFromMenuItem(item, key) {
  return {
    key,
    menuItemId: item?.id || null,
    name: getMenuDishName(item),
    name_uz: cleanText(item?.name_uz),
    name_ru: cleanText(item?.name_ru),
    name_en: cleanText(item?.name_en),
    category_id: item?.category_id || null,
    image_url: item?.image_url || '',
    available: item?.available !== false,
    currentMenuItem: true,
    quantity: 0,
    revenue: 0,
    orders: 0,
    saleLines: 0,
    firstSoldAt: null,
    lastSoldAt: null,
  }
}

function createDishRowFromOrderItem(item, key) {
  const name = getOrderItemDishName(item)
  return {
    key,
    menuItemId: getOrderItemProductId(item),
    name,
    name_uz: '',
    name_ru: '',
    name_en: name,
    category_id: null,
    image_url: item?.image_url || '',
    available: false,
    currentMenuItem: false,
    quantity: 0,
    revenue: 0,
    orders: 0,
    saleLines: 0,
    firstSoldAt: null,
    lastSoldAt: null,
  }
}

function addOrderId(setMap, key, orderId) {
  if (!setMap.has(key)) setMap.set(key, new Set())
  setMap.get(key).add(orderId)
}

function bucketRows(entries, keyName) {
  const map = new Map()

  entries.forEach(entry => {
    const key = entry[keyName]
    if (key == null || key === '') return
    if (!map.has(key)) {
      map.set(key, {
        [keyName]: key,
        quantity: 0,
        revenue: 0,
        orders: 0,
        saleLines: 0,
        orderIds: new Set(),
      })
    }
    const row = map.get(key)
    row.quantity += entry.quantity
    row.revenue += entry.revenue
    row.saleLines += 1
    row.orderIds.add(entry.orderId)
  })

  return Array.from(map.values()).map(row => {
    const { orderIds, ...rest } = row
    return { ...rest, orders: orderIds.size }
  })
}

function sortLowSellingDishes(a, b) {
  return (
    a.quantity - b.quantity ||
    a.revenue - b.revenue ||
    a.name.localeCompare(b.name)
  )
}

export function getDishSalesAnalysis({ orders = [], menuItems = [], selectedDishKey = ALL_DISHES_KEY } = {}) {
  const dishMap = new Map()
  const orderIdsByDish = new Map()
  const sales = []

  ;(menuItems || []).forEach(item => {
    const key = getMenuDishSalesKey(item)
    if (!key || dishMap.has(key)) return
    dishMap.set(key, createDishRowFromMenuItem(item, key))
  })

  ;(orders || []).forEach((order, orderIndex) => {
    const orderDate = getOrderDate(order)
    const orderId = cleanText(order?.id) || `order-${orderIndex}`
    const date = orderDate ? toLocalDateStr(orderDate) : ''
    const hour = orderDate ? getRestaurantHour(orderDate) : null

    getOrderItems(order).forEach(item => {
      if (isCancelledOrderItem(item)) return
      const key = getOrderItemDishSalesKey(item)
      if (!key) return

      if (!dishMap.has(key)) dishMap.set(key, createDishRowFromOrderItem(item, key))
      const dish = dishMap.get(key)
      const quantity = positiveQuantity(item.quantity)
      const unitPrice = getOrderItemUnitPrice(item)
      const revenue = unitPrice * quantity

      dish.quantity += quantity
      dish.revenue += revenue
      dish.saleLines += 1
      if (!dish.image_url && item?.image_url) dish.image_url = item.image_url
      if (!dish.firstSoldAt || compareInstant(orderDate, dish.firstSoldAt) < 0) dish.firstSoldAt = orderDate || null
      if (!dish.lastSoldAt || compareInstant(orderDate, dish.lastSoldAt) > 0) dish.lastSoldAt = orderDate || null
      addOrderId(orderIdsByDish, key, orderId)

      sales.push({
        dishKey: key,
        menuItemId: dish.menuItemId,
        dishName: dish.name,
        orderId,
        orderDate: orderDate || null,
        date,
        hour,
        quantity,
        unitPrice,
        revenue,
        tableName: order?.table_name || '',
        waiterName: order?.waiter_name || order?.waiter_email || '',
        orderType: inferOrderType(order),
      })
    })
  })

  orderIdsByDish.forEach((orderIds, key) => {
    const dish = dishMap.get(key)
    if (dish) dish.orders = orderIds.size
  })

  const dishes = Array.from(dishMap.values()).sort(sortLowSellingDishes)
  const filteredSales = selectedDishKey === ALL_DISHES_KEY
    ? sales
    : sales.filter(entry => entry.dishKey === selectedDishKey)
  const selectedDish = selectedDishKey === ALL_DISHES_KEY
    ? null
    : dishes.find(dish => dish.key === selectedDishKey) || null
  const selectedOrderIds = new Set(filteredSales.map(entry => entry.orderId))
  const firstSoldAt = filteredSales.reduce((best, entry) => (
    !best || compareInstant(entry.orderDate, best) < 0 ? entry.orderDate : best
  ), null)
  const lastSoldAt = filteredSales.reduce((best, entry) => (
    !best || compareInstant(entry.orderDate, best) > 0 ? entry.orderDate : best
  ), null)
  const quantity = filteredSales.reduce((sum, entry) => sum + entry.quantity, 0)
  const revenue = filteredSales.reduce((sum, entry) => sum + entry.revenue, 0)
  const daily = bucketRows(filteredSales, 'date').sort((a, b) => a.date.localeCompare(b.date))
  const hourly = bucketRows(filteredSales, 'hour').sort((a, b) => a.hour - b.hour)

  return {
    dishes,
    selectedDish,
    totals: {
      quantity,
      revenue,
      orders: selectedOrderIds.size,
      saleLines: filteredSales.length,
      averagePerOrder: selectedOrderIds.size > 0 ? quantity / selectedOrderIds.size : 0,
      firstSoldAt,
      lastSoldAt,
    },
    daily,
    hourly,
    sales: filteredSales.sort((a, b) => compareInstant(b.orderDate, a.orderDate)),
  }
}
