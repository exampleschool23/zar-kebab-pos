export const MENU_SALE_UNIT_PIECE = 'piece'
export const MENU_SALE_UNIT_KG = 'kg'

export function normalizeMenuSaleUnit(value) {
  return String(value || '').toLowerCase() === MENU_SALE_UNIT_KG
    ? MENU_SALE_UNIT_KG
    : MENU_SALE_UNIT_PIECE
}

export function isMenuItemSoldByWeight(item) {
  return normalizeMenuSaleUnit(item?.sale_unit ?? item?.saleUnit) === MENU_SALE_UNIT_KG
}

export function menuQuantityStep(itemOrUnit) {
  const unit = typeof itemOrUnit === 'string'
    ? normalizeMenuSaleUnit(itemOrUnit)
    : normalizeMenuSaleUnit(itemOrUnit?.sale_unit ?? itemOrUnit?.saleUnit)
  return unit === MENU_SALE_UNIT_KG ? 0.1 : 1
}

export function normalizeMenuQuantity(value, itemOrUnit, fallback = 1) {
  const unit = typeof itemOrUnit === 'string'
    ? normalizeMenuSaleUnit(itemOrUnit)
    : normalizeMenuSaleUnit(itemOrUnit?.sale_unit ?? itemOrUnit?.saleUnit)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  if (unit === MENU_SALE_UNIT_KG) return Math.round(parsed * 1000) / 1000
  return Math.max(1, Math.round(parsed))
}

export function changeMenuQuantity(value, itemOrUnit, direction) {
  const step = menuQuantityStep(itemOrUnit)
  const current = normalizeMenuQuantity(value, itemOrUnit)
  return normalizeMenuQuantity(current + step * direction, itemOrUnit, 0)
}

export function formatMenuQuantity(value, itemOrUnit, options = {}) {
  const unit = typeof itemOrUnit === 'string'
    ? normalizeMenuSaleUnit(itemOrUnit)
    : normalizeMenuSaleUnit(itemOrUnit?.sale_unit ?? itemOrUnit?.saleUnit)
  const quantity = normalizeMenuQuantity(value, unit)
  if (unit !== MENU_SALE_UNIT_KG) return options.withUnit ? `${quantity} pc` : String(quantity)
  const formatted = new Intl.NumberFormat(options.locale || 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(quantity)
  return options.withUnit === false ? formatted : `${formatted} kg`
}

export function menuPriceUnitSuffix(itemOrUnit, lang = 'en') {
  const unit = typeof itemOrUnit === 'string'
    ? normalizeMenuSaleUnit(itemOrUnit)
    : normalizeMenuSaleUnit(itemOrUnit?.sale_unit ?? itemOrUnit?.saleUnit)
  if (unit === MENU_SALE_UNIT_KG) return lang === 'ru' ? ' / кг' : ' / kg'
  return ''
}

export function menuSaleUnitLabel(unit, lang = 'en') {
  const normalized = normalizeMenuSaleUnit(unit)
  if (normalized === MENU_SALE_UNIT_KG) {
    return lang === 'uz' ? 'Kilogramm (kg)' : lang === 'ru' ? 'Килограмм (кг)' : 'Kilogram (kg)'
  }
  return lang === 'uz' ? 'Dona' : lang === 'ru' ? 'Поштучно' : 'Per item'
}
