export const MENU_ITEM_COST_SOURCE_MANUAL = 'manual'
export const MENU_ITEM_COST_SOURCE_TECH_CARD = 'tech_card'

export function normalizeMenuItemCostSource(value) {
  return value === MENU_ITEM_COST_SOURCE_TECH_CARD
    ? MENU_ITEM_COST_SOURCE_TECH_CARD
    : MENU_ITEM_COST_SOURCE_MANUAL
}

export function isTechCardMenuItemCost(value) {
  const source = value && typeof value === 'object' ? value.cost_source : value
  return normalizeMenuItemCostSource(source) === MENU_ITEM_COST_SOURCE_TECH_CARD
}

export function getRequiredMenuItemCost(value) {
  if (value === null || value === undefined) return null

  const normalized = typeof value === 'string'
    ? value.replace(/\s/g, '').trim()
    : value
  if (normalized === '') return null

  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) return null

  const cost = Math.round(numeric)
  return cost > 0 ? cost : null
}

export function hasRequiredMenuItemCost(value) {
  return getRequiredMenuItemCost(value) !== null
}
