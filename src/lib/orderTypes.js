export const ORDER_TYPE_KEYS = ['dine_in', 'take_away', 'delivery', 'game_club']

export const ORDER_TYPE_LABELS = {
  dine_in: { uz: 'Zalda', ru: 'В зале', en: 'Dine In' },
  take_away: { uz: 'Olib ketish', ru: 'Заказ с собой', en: 'Take Away' },
  game_club: { uz: 'Game Club', ru: 'Игровой клуб', en: 'Game Club' },
  delivery: { uz: 'Yetkazib berish', ru: 'Доставка', en: 'Delivery' },
}

export function normalizeOrderType(value) {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('game_club') || raw.includes('game club') || raw.includes('игровой клуб')) return 'game_club'
  if (raw.includes('delivery') || raw.includes('deliver') || raw.includes('достав') || raw.includes('yetkaz')) return 'delivery'
  if (raw.includes('take') || raw.includes('away') || raw.includes('с собой') || raw.includes('olib')) return 'take_away'
  return 'dine_in'
}

export function isDineInOrderType(value) {
  return normalizeOrderType(value) === 'dine_in'
}

export function isTakeAwayOrderType(value) {
  return normalizeOrderType(value) === 'take_away'
}

export function isDeliveryOrderType(value) {
  return normalizeOrderType(value) === 'delivery'
}

export function isOffPremiseOrderType(value) {
  return !isDineInOrderType(value)
}

export function orderTypeLabel(value, lang = 'en') {
  const key = normalizeOrderType(value)
  return ORDER_TYPE_LABELS[key]?.[lang] || ORDER_TYPE_LABELS[key]?.en || ORDER_TYPE_LABELS.dine_in.en
}

export function inferOrderType(order) {
  const explicit = order?.order_type || order?.orderType
  if (explicit) return normalizeOrderType(explicit)
  const text = String(order?.table_name || '').toLowerCase()
  if (text.includes('game club') || text.includes('игровой клуб')) return 'game_club'
  if (text.includes('delivery') || text.includes('достав')) return 'delivery'
  if (text.includes('take') || text.includes('away')) return 'take_away'
  return 'dine_in'
}

export function orderTypePrefix(value) {
  const key = normalizeOrderType(value)
  if (key === 'game_club') return 'GC'
  if (key === 'delivery') return 'DL'
  if (key === 'take_away') return 'TA'
  return 'DI'
}
