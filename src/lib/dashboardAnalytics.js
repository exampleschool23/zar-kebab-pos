import {
  getOrderDate,
  getOrderItems,
  getOrderPaymentBreakdown,
  getOrderTotal,
  toLocalDateStr,
} from './analytics.js'

function localDateStr(value) {
  return toLocalDateStr(value instanceof Date ? value.toISOString() : value)
}

function todayStr(now = new Date()) {
  return localDateStr(now)
}

export function isOrderInDashboardPeriod(order, period, now = new Date()) {
  const ds = localDateStr(getOrderDate(order))
  if (!ds) return false

  if (period === 'today') return ds === todayStr(now)

  if (period === '7days') {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    return ds >= localDateStr(start) && ds <= todayStr(now)
  }

  if (period === 'month') {
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`
    return ds.startsWith(prefix)
  }

  if (period === 'year') {
    return ds.startsWith(`${now.getFullYear()}-`)
  }

  return true
}

export function getDashboardPeriodOrders(orders, period, now = new Date()) {
  return (orders || []).filter(order => isOrderInDashboardPeriod(order, period, now))
}

export function getDashboardSalesByCategory(orders, menuItemMap, categoryMap, lang = 'en') {
  const map = {}
  ;(orders || []).forEach(order => {
    getOrderItems(order).forEach(item => {
      const mi = menuItemMap[item.menu_item_id]
      const cat = mi ? categoryMap[mi.category_id] : null
      const name = cat
        ? (cat[`name_${lang}`] || cat.name_en || cat.name_uz || 'Other')
        : 'Other'
      const revenue = (Number(item.price) || 0) * (Number(item.quantity) || 1)
      if (!map[name]) map[name] = { name, revenue: 0, qty: 0 }
      map[name].revenue += revenue
      map[name].qty += Number(item.quantity) || 1
    })
  })

  const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue)
  const total = rows.reduce((sum, row) => sum + row.revenue, 0)
  return rows.map(row => ({
    ...row,
    pct: total > 0 ? Math.round((row.revenue / total) * 100) : 0,
  }))
}

export function getDashboardBestSelling(orders, menuItemMap) {
  const map = {}
  ;(orders || []).forEach(order => {
    getOrderItems(order).forEach(item => {
      const key = item.menu_item_id || item.name
      if (!map[key]) {
        map[key] = {
          menuItemId: item.menu_item_id,
          name: item.name,
          qty: 0,
          revenue: 0,
        }
      }
      map[key].qty += Number(item.quantity) || 1
      map[key].revenue += (Number(item.price) || 0) * (Number(item.quantity) || 1)
    })
  })

  return Object.values(map)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
    .map(row => ({ ...row, image_url: menuItemMap[row.menuItemId]?.image_url || '' }))
}

export function getDashboardPaymentMethods(orders, labels = {}) {
  const knownLabels = {
    cash: labels.cash || 'Cash',
    card: labels.card || 'Card',
    terminal: labels.terminal || 'Terminal',
    qr: labels.qr || 'QR Code',
    loyalty_card: labels.loyalty || 'Loyalty',
    unknown: labels.unknown || 'Unknown',
  }
  const colors = labels.colors || {}
  const map = {}

  ;(orders || []).forEach(order => {
    const breakdown = getOrderPaymentBreakdown(order)
    const rows = breakdown.length > 0
      ? breakdown
      : [{ method: order.payment_method, amount: getOrderTotal(order) }]

    rows.forEach(row => {
      const raw = (row.method || '').toLowerCase().trim()
      const key = ['cash', 'card', 'terminal', 'qr', 'loyalty_card'].includes(raw) ? raw : 'unknown'
      const amount = Number(row.amount) || 0
      map[key] = (map[key] || 0) + amount
    })
  })

  const total = Object.values(map).reduce((sum, value) => sum + value, 0)
  return Object.entries(map)
    .map(([key, amount]) => ({
      key,
      label: knownLabels[key] || knownLabels.unknown,
      amount,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
      color: colors[key],
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function formatReadableDateTime(date, locale = 'en-US') {
  const value = typeof date === 'string' ? new Date(date) : date
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return ''

  const dateText = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value)
  const timeText = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value)

  return `${dateText} · ${timeText}`
}
