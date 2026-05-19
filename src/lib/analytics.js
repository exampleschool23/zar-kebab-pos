export function isPaidOrder(o) {
  if (!o) return false
  if (o.status === 'cancelled' || o.payment_status === 'cancelled') return false
  return (
    o.payment_status === 'paid' ||
    o.status === 'paid' ||
    o.status === 'completed' ||
    !!o.paid_at
  )
}

export function isActiveNeedsBillOrder(order, tables = []) {
  if (!order || isPaidOrder(order)) return false
  if (order.status !== 'needs_bill') return false
  const table = tables.find(t => t.id === order.table_id)
  return table?.status === 'needs_bill'
}

export function getOrderDate(o) {
  return o?.paid_at || o?.created_at || null
}

export function getOrderItems(o) {
  return o?.items || o?.order_items || []
}

export function getOrderServiceRatePct(o, fallbackPct = 20) {
  const typeText = String(o?.order_type || o?.orderType || o?.table_name || '').toLowerCase()
  if (typeText.includes('take') || (!o?.table_id && typeText.includes('away'))) return 0
  const pct = Number(o?.service_rate_pct ?? o?.service_percent ?? o?.servicePercent)
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : fallbackPct
}

export function getOrderServiceFee(o, fallbackPct = 20) {
  return getOrderPaymentSummary(o, getOrderItems(o), fallbackPct).serviceFee
}

export function getOrderTotal(o, fallbackServicePct = 20) {
  return getOrderPaymentSummary(o, getOrderItems(o), fallbackServicePct).total
}

export function getOrderPaymentSummary(order, items = getOrderItems(order), fallbackServicePct = 20) {
  const itemsSubtotal = items.reduce(
    (s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1),
    0
  )
  const subtotal = itemsSubtotal || (Number(order?.subtotal) || 0)
  if (subtotal <= 0 && Number(order?.total) > 0) {
    return {
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      afterDiscount: 0,
      serviceRatePct: getOrderServiceRatePct(order, fallbackServicePct),
      serviceFee: Number(order?.service_fee) || 0,
      total: Number(order.total),
    }
  }
  const discPct = Number(order?.loyalty_discount_pct ?? order?.discount_percent ?? 0) || 0
  const serviceRatePct = getOrderServiceRatePct(order, fallbackServicePct)
  const serviceFee = Math.round(subtotal * serviceRatePct / 100)
  const grossAmount = subtotal + serviceFee
  const discountAmount = discPct > 0
    ? Math.round(grossAmount * discPct / 100)
    : (Number(order?.loyalty_discount_amount) || Number(order?.discount_amount) || 0)
  const afterDiscount = Math.max(0, grossAmount - discountAmount)

  return {
    subtotal,
    discountPercent: discPct,
    discountAmount,
    grossAmount,
    afterDiscount,
    serviceRatePct,
    serviceFee,
    total: afterDiscount,
  }
}

export function getOrderPaymentFields(order, items = getOrderItems(order), fallbackServicePct = 20) {
  const summary = getOrderPaymentSummary(order, items, fallbackServicePct)
  const fields = {
    subtotal: summary.subtotal,
    service_fee: summary.serviceFee,
    service_rate_pct: summary.serviceRatePct,
    total: summary.total,
  }

  if (summary.discountPercent > 0) {
    fields.loyalty_discount_pct = summary.discountPercent
  }

  if (summary.discountAmount > 0) {
    fields.loyalty_discount_amount = summary.discountAmount
  }

  return fields
}

export function normalizePaymentMethod(method) {
  const raw = String(method || '').toLowerCase().trim()
  if (raw === 'qr_code' || raw === 'qr-code' || raw === 'qrcode') return 'qr'
  if (raw === 'loyalty' || raw === 'loyalty-card' || raw === 'loyalty_card') return 'loyalty_card'
  if (['cash', 'card', 'terminal', 'qr', 'loyalty_card', 'other', 'mixed'].includes(raw)) return raw
  return raw || 'unknown'
}

export function getOrderPayments(order) {
  const rows = order?.payments || order?.order_payments || []
  if (Array.isArray(rows) && rows.length > 0) {
    return rows
      .map(row => ({
        ...row,
        method: normalizePaymentMethod(row.method || row.payment_method),
        amount: Math.round(Number(row.amount) || 0),
      }))
      .filter(row => row.amount > 0)
  }

  if (!isPaidOrder(order)) return []

  const total = getOrderTotal(order)
  if (total <= 0) return []

  return [{
    method: normalizePaymentMethod(order?.payment_method),
    amount: total,
  }]
}

export function normalizeSplitPayments(payments, total) {
  const due = Math.max(0, Math.round(Number(total) || 0))
  const rows = (payments || [])
    .map(row => ({
      method: normalizePaymentMethod(row.method || row.payment_method),
      amount: Math.round(Number(row.amount) || 0),
    }))
    .filter(row => row.amount > 0 && row.method !== 'mixed')

  if (due <= 0) return []
  if (rows.length === 0) return [{ method: 'cash', amount: due }]

  const sum = rows.reduce((s, row) => s + row.amount, 0)
  if (sum <= due) return rows

  const adjusted = rows.map(row => ({ ...row }))
  let overpay = sum - due
  const cashIndex = adjusted.map(row => row.method).lastIndexOf('cash')
  const preferredIndex = cashIndex >= 0 ? cashIndex : adjusted.length - 1

  for (let offset = 0; offset < adjusted.length && overpay > 0; offset += 1) {
    const index = (preferredIndex - offset + adjusted.length) % adjusted.length
    const reduction = Math.min(adjusted[index].amount, overpay)
    adjusted[index].amount -= reduction
    overpay -= reduction
  }

  return adjusted.filter(row => row.amount > 0)
}

export function getSplitPaymentValidation(payments, total) {
  const due = Math.max(0, Math.round(Number(total) || 0))
  const paidAmount = (payments || []).reduce(
    (sum, row) => sum + Math.max(0, Math.round(Number(row.amount) || 0)),
    0
  )
  const overpaidAmount = Math.max(0, paidAmount - due)
  const remainingAmount = Math.max(0, due - paidAmount)
  const isFullyPaid = due > 0 && paidAmount === due

  return {
    totalAmount: due,
    paidAmount,
    remainingAmount,
    overpaidAmount,
    isOverpaid: overpaidAmount > 0,
    isFullyPaid,
    canConfirmPayment: isFullyPaid && overpaidAmount === 0,
  }
}

export function getPaymentMethodSummary(payments, fallbackMethod = null) {
  const rows = (payments || []).filter(row => Number(row.amount) > 0)
  if (rows.length === 0) return normalizePaymentMethod(fallbackMethod)
  const methods = [...new Set(rows.map(row => normalizePaymentMethod(row.method || row.payment_method)))]
  return methods.length === 1 ? methods[0] : 'mixed'
}

export function allocateSplitPaymentsToOrders(orderTotals, payments) {
  const totals = (orderTotals || [])
    .map(row => ({
      order_id: row.order_id || row.orderId || row.id,
      total: Math.max(0, Math.round(Number(row.total) || 0)),
    }))
    .filter(row => row.order_id && row.total > 0)
  const totalDue = totals.reduce((sum, row) => sum + row.total, 0)
  const normalizedPayments = normalizeSplitPayments(payments, totalDue)
  const remainingByOrder = new Map(totals.map(row => [row.order_id, row.total]))
  const allocations = []

  normalizedPayments.forEach(payment => {
    let remainingPayment = payment.amount
    for (const orderRow of totals) {
      if (remainingPayment <= 0) break
      const remainingOrder = remainingByOrder.get(orderRow.order_id) || 0
      if (remainingOrder <= 0) continue
      const amount = Math.min(remainingPayment, remainingOrder)
      allocations.push({
        order_id: orderRow.order_id,
        method: payment.method,
        amount,
      })
      remainingByOrder.set(orderRow.order_id, remainingOrder - amount)
      remainingPayment -= amount
    }
  })

  return allocations
}

export function getOrderPaymentBreakdown(order) {
  const map = {}
  getOrderPayments(order).forEach(row => {
    const method = normalizePaymentMethod(row.method)
    map[method] = (map[method] || 0) + (Number(row.amount) || 0)
  })
  return Object.entries(map).map(([method, amount]) => ({ method, amount }))
}

function stableStringify(value) {
  if (value == null) return ''
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join(',')}}`
  }
  return String(value)
}

export function getOrderItemProductId(item) {
  return item?.menu_item_id ?? item?.menuItemId ?? item?.product_id ?? item?.productId ?? null
}

export function getOrderItemOptionsKey(item) {
  const optionFields = [
    'variant_id',
    'variantId',
    'size_id',
    'sizeId',
    'modifiers',
    'selected_modifiers',
    'selectedModifiers',
    'options',
    'selected_options',
    'selectedOptions',
    'extras',
    'selected_extras',
    'selectedExtras',
    'notes',
    'order_type',
    'orderType',
    'service_type',
    'serviceType',
    'dining_type',
    'diningType',
    'fulfillment_type',
    'fulfillmentType',
    'is_takeaway',
    'isTakeAway',
  ]

  const selected = {}
  optionFields.forEach(field => {
    if (item?.[field] != null) selected[field] = item[field]
  })
  return stableStringify(selected)
}

export function getGroupedOrderItems(items, resolveName) {
  const grouped = new Map()

  items.forEach((item, index) => {
    const productId = getOrderItemProductId(item)
    const key = productId != null
      ? `${productId}::${getOrderItemOptionsKey(item)}`
      : `row::${item.id || index}`
    const existing = grouped.get(key)

    if (existing) {
      grouped.set(key, {
        ...existing,
        quantity: (Number(existing.quantity) || 1) + (Number(item.quantity) || 1),
      })
      return
    }

    grouped.set(key, {
      ...item,
      name: resolveName ? resolveName(item) : item.name,
    })
  })

  return Array.from(grouped.values())
}

export function toLocalDateStr(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

export function matchesRange(o, from, to) {
  if (!from && !to) return true
  const ds = toLocalDateStr(getOrderDate(o))
  if (!ds) return false
  if (from && ds < from) return false
  if (to && ds > to) return false
  return true
}

export function groupOrdersBySession(orders) {
  const map = {}

  orders.forEach(o => {
    const anchor = o.paid_at
      ? o.paid_at.slice(0, 16)
      : (o.created_at || '').slice(0, 10)
    const typeText = String(o.order_type || o.table_name || '').toLowerCase()
    const isTakeAway = typeText.includes('take') || (!o.table_id && typeText.includes('away'))
    const key = isTakeAway || !o.table_id ? `order::${o.id}` : `${o.table_id}::${anchor}`

    if (!map[key]) {
      map[key] = {
        ...o,
        items: [...getOrderItems(o)],
        total: Number(o.total) || 0,
        subtotal: Number(o.subtotal) || 0,
        service_fee: Number(o.service_fee) || 0,
        service_rate_pct: Number(o.service_rate_pct ?? o.service_percent ?? o.servicePercent) || null,
        loyalty_discount_pct: Number(o.loyalty_discount_pct ?? o.discount_percent) || 0,
        loyalty_discount_amount: Number(o.loyalty_discount_amount) || 0,
        payments: [...getOrderPayments(o)],
        _orderCount: 1,
        _mergedIds: [o.id],
      }
      return
    }

    const session = map[key]
    session.items = [...session.items, ...getOrderItems(o)]
    session.total = (session.total || 0) + (Number(o.total) || 0)
    session.subtotal = (session.subtotal || 0) + (Number(o.subtotal) || 0)
    session.service_fee = (session.service_fee || 0) + (Number(o.service_fee) || 0)
    const servicePct = Number(o.service_rate_pct ?? o.service_percent ?? o.servicePercent)
    if (session.service_rate_pct == null && Number.isFinite(servicePct)) {
      session.service_rate_pct = servicePct
    }
    session.loyalty_discount_amount =
      (session.loyalty_discount_amount || 0) + (Number(o.loyalty_discount_amount) || 0)
    session.payments = [...(session.payments || []), ...getOrderPayments(o)]
    const discountPct = Number(o.loyalty_discount_pct ?? o.discount_percent)
    if (!session.loyalty_discount_pct && Number.isFinite(discountPct)) {
      session.loyalty_discount_pct = discountPct
    }
    session._mergedIds = [...(session._mergedIds || []), o.id]
    session._orderCount += 1

    if (!session.payment_method && o.payment_method) session.payment_method = o.payment_method
    if (o.created_at && new Date(o.created_at) < new Date(session.created_at)) session.created_at = o.created_at
    if (o.paid_at && (!session.paid_at || new Date(o.paid_at) > new Date(session.paid_at))) {
      session.paid_at = o.paid_at
    }
  })

  return Object.values(map)
}
