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
  const pct = Number(o?.service_rate_pct)
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : fallbackPct
}

export function getOrderServiceFee(o, fallbackPct = 20) {
  const sub = Number(o?.subtotal) || 0
  const disc = Number(o?.loyalty_discount_amount) || Number(o?.discount_amount) || 0
  const afterDisc = Math.max(0, sub - disc)
  if (afterDisc <= 0) return Number(o?.service_fee) || 0

  const servicePct = getOrderServiceRatePct(o, fallbackPct)
  return Math.round(afterDisc * servicePct / 100)
}

export function getOrderTotal(o, fallbackServicePct = 20) {
  const sub = Number(o?.subtotal) || 0
  const disc = Number(o?.loyalty_discount_amount) || Number(o?.discount_amount) || 0
  if (sub > 0) return Math.max(0, sub - disc) + getOrderServiceFee(o, fallbackServicePct)

  if (o?.total != null && Number(o.total) > 0) return Number(o.total)

  const itemsSum = getOrderItems(o).reduce(
    (s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1),
    0
  )
  return Math.round(itemsSum * 1.2)
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
        service_rate_pct: Number(o.service_rate_pct) || null,
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
    if (session.service_rate_pct == null && o.service_rate_pct != null) {
      session.service_rate_pct = Number(o.service_rate_pct)
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
