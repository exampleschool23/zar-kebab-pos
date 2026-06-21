export const PRICE_MODE_REGULAR = 'regular'
export const PRICE_MODE_TOURIST = 'tourist'
export const DEFAULT_PRICE_MODE = PRICE_MODE_REGULAR
export const PRICE_MODES = [PRICE_MODE_REGULAR, PRICE_MODE_TOURIST]

export function normalizePriceMode(mode) {
  return mode === PRICE_MODE_TOURIST ? PRICE_MODE_TOURIST : PRICE_MODE_REGULAR
}

export function getPriceModeLabel(mode, lang = 'en') {
  const normalized = normalizePriceMode(mode)
  if (normalized === PRICE_MODE_TOURIST) {
    if (lang === 'uz') return 'Turist'
    if (lang === 'ru') return 'Турист'
    return 'Tourist'
  }
  if (lang === 'uz') return 'Oddiy'
  if (lang === 'ru') return 'Обычное'
  return 'Regular'
}

export function calculateUnitPrice(basePrice, priceMode = DEFAULT_PRICE_MODE) {
  const base = Math.max(0, Math.round(Number(basePrice) || 0))
  if (normalizePriceMode(priceMode) !== PRICE_MODE_TOURIST) return base
  return Math.round((base * 1.2) / 1000) * 1000
}

export function getOrderItemBasePrice(item) {
  return Math.max(0, Math.round(Number(item?.base_price ?? item?.basePrice ?? item?.price ?? 0) || 0))
}

export function getOrderItemUnitPrice(item) {
  return Math.max(0, Math.round(Number(item?.unit_price ?? item?.unitPrice ?? item?.price ?? 0) || 0))
}

export function withPriceModeFields(item, priceMode = DEFAULT_PRICE_MODE) {
  const normalized = normalizePriceMode(priceMode)
  const basePrice = getOrderItemBasePrice(item)
  const unitPrice = calculateUnitPrice(basePrice, normalized)
  return {
    ...item,
    base_price: basePrice,
    unit_price: unitPrice,
    price_mode: normalized,
    price: unitPrice,
  }
}

export function getMenuItemForPriceMode(item, priceMode = DEFAULT_PRICE_MODE) {
  return withPriceModeFields(item, priceMode)
}
