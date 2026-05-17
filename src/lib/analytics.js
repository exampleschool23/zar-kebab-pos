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

export function getOrderDate(o) {
  return o?.paid_at || o?.created_at || null
}

export function getOrderItems(o) {
  return o?.items || o?.order_items || []
}

export function getOrderServiceRatePct(o, fallbackPct = 20) {
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
  const discountAmount = discPct > 0
    ? Math.round(subtotal * discPct / 100)
    : (Number(order?.loyalty_discount_amount) || Number(order?.discount_amount) || 0)
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const serviceRatePct = getOrderServiceRatePct(order, fallbackServicePct)
  const serviceFee = Math.round(afterDiscount * serviceRatePct / 100)

  return {
    subtotal,
    discountPercent: discPct,
    discountAmount,
    afterDiscount,
    serviceRatePct,
    serviceFee,
    total: afterDiscount + serviceFee,
  }
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
    const key = `${o.table_id}::${anchor}`

    if (!map[key]) {
      map[key] = {
        ...o,
        items: [...getOrderItems(o)],
        total: Number(o.total) || 0,
        subtotal: Number(o.subtotal) || 0,
        service_fee: Number(o.service_fee) || 0,
        service_rate_pct: Number(o.service_rate_pct ?? o.service_percent ?? o.servicePercent) || null,
        loyalty_discount_amount: Number(o.loyalty_discount_amount) || 0,
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
