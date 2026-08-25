export const TECH_CARD_UNITS = ['g', 'kg', 'ml', 'l', 'piece']

export function normalizeTechCardNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

export function normalizeTechCardUnit(value, fallback = 'kg') {
  const normalized = String(value || '').trim().toLowerCase()
  return TECH_CARD_UNITS.includes(normalized) ? normalized : fallback
}

export function createBlankTechCard(menuItemId = '') {
  return {
    menu_item_id: menuItemId,
    portion_count: '1',
    batch_output_quantity: '',
    batch_output_unit: 'kg',
    preparation_steps: '',
    notes: '',
    ingredients: [],
  }
}

export function createBlankTechCardIngredient() {
  return {
    name: '',
    quantity: '1',
    unit: 'kg',
    unit_price_uzs: '',
  }
}

export function normalizeTechCard(card = {}) {
  return {
    menu_item_id: String(card.menu_item_id || '').trim(),
    portion_count: String(card.portion_count ?? '1'),
    batch_output_quantity: card.batch_output_quantity == null ? '' : String(card.batch_output_quantity),
    batch_output_unit: normalizeTechCardUnit(card.batch_output_unit, 'kg'),
    preparation_steps: String(card.preparation_steps || ''),
    notes: String(card.notes || ''),
    updated_at: card.updated_at || null,
    ingredients: (card.ingredients || []).map(ingredient => ({
      id: ingredient.id || null,
      name: String(ingredient.name || ''),
      quantity: String(ingredient.quantity ?? '1'),
      unit: normalizeTechCardUnit(ingredient.unit, 'kg'),
      unit_price_uzs: String(ingredient.unit_price_uzs ?? ''),
    })),
  }
}

export function calculateTechCardSummary(card = {}) {
  const ingredients = (card.ingredients || []).map(ingredient => {
    const quantity = normalizeTechCardNumber(ingredient.quantity)
    const unitPrice = normalizeTechCardNumber(ingredient.unit_price_uzs)
    return {
      ...ingredient,
      quantity,
      unitPrice,
      lineCost: quantity * unitPrice,
    }
  })
  const batchCost = ingredients.reduce((sum, ingredient) => sum + ingredient.lineCost, 0)
  const portionCount = normalizeTechCardNumber(card.portion_count)
  const batchOutputQuantity = normalizeTechCardNumber(card.batch_output_quantity)

  return {
    ingredients,
    batchCost,
    portionCount,
    portionCost: portionCount > 0 ? batchCost / portionCount : 0,
    batchOutputQuantity,
    outputPerPortion: portionCount > 0 && batchOutputQuantity > 0
      ? batchOutputQuantity / portionCount
      : null,
  }
}

export function buildTechCardPayload(card = {}) {
  const normalized = normalizeTechCard(card)
  return {
    menu_item_id: normalized.menu_item_id,
    portion_count: normalizeTechCardNumber(normalized.portion_count),
    batch_output_quantity: normalized.batch_output_quantity === ''
      ? null
      : normalizeTechCardNumber(normalized.batch_output_quantity),
    batch_output_unit: normalized.batch_output_unit,
    preparation_steps: normalized.preparation_steps.trim(),
    notes: normalized.notes.trim(),
    ingredients: normalized.ingredients.map((ingredient, index) => ({
      name: ingredient.name.trim(),
      quantity: normalizeTechCardNumber(ingredient.quantity),
      unit: ingredient.unit,
      unit_price_uzs: Math.round(normalizeTechCardNumber(ingredient.unit_price_uzs)),
      sort_order: index + 1,
    })),
  }
}

export function validateTechCard(card = {}) {
  const payload = buildTechCardPayload(card)
  if (!payload.menu_item_id) return 'Menu item is required.'
  if (!(payload.portion_count > 0)) return 'Portions per batch must be greater than zero.'
  if (payload.batch_output_quantity !== null && !(payload.batch_output_quantity > 0)) {
    return 'Batch output must be greater than zero when provided.'
  }
  if (payload.ingredients.length === 0) return 'Add at least one ingredient.'
  for (const ingredient of payload.ingredients) {
    if (!ingredient.name) return 'Every ingredient needs a name.'
    if (!(ingredient.quantity > 0)) return `${ingredient.name}: quantity must be greater than zero.`
    if (ingredient.unit_price_uzs < 0) return `${ingredient.name}: price cannot be negative.`
  }
  if (!payload.preparation_steps) return 'Add the preparation method.'
  return ''
}

export function techCardFingerprint(card = {}) {
  return JSON.stringify(buildTechCardPayload(card))
}
