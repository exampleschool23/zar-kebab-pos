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
