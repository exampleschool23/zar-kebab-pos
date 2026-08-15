import { getItemName } from './i18n.js'
import { isCustomerMenuCategory, isCustomerMenuItem, isTouristHiddenMenuCategory } from './menuItems.js'
import { normalizeMenuQuantity, normalizeMenuSaleUnit } from './menuSaleUnits.js'
import { PRICE_MODE_REGULAR, PRICE_MODE_TOURIST, calculateUnitPrice, getOrderItemBasePrice } from './priceModes.js'

function rawOptionGroups(item) {
  let value = item?.option_groups ?? item?.optionGroups ?? []
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = []
    }
  }
  return Array.isArray(value) ? value : []
}

function hasOptionLabel(option) {
  return !!String(
    option?.label_en || option?.label_ru || option?.label_uz ||
    option?.label || option?.name || ''
  ).trim()
}

function publicOptionGroups(item) {
  return rawOptionGroups(item).flatMap((group, groupIndex) => {
    const rawOptions = Array.isArray(group?.options) ? group.options : []
    if (rawOptions.length === 0) return []
    return [{
      id: String(group?.id || `group_${groupIndex + 1}`),
      required: group?.required !== false,
      options: rawOptions.flatMap((option, optionIndex) => {
        const publicHidden = option?.public_hidden === true || option?.publicHidden === true
        if (publicHidden || option?.available === false || !hasOptionLabel(option)) return []
        return [{
          id: String(option?.id || `option_${optionIndex + 1}`),
          price: Math.max(0, Math.round(Number(option?.price ?? option?.variant_price ?? 0) || 0)),
          priceDelta: Math.max(0, Math.round(Number(option?.price_delta ?? option?.priceDelta ?? 0) || 0)),
        }]
      }),
    }]
  })
}

function normalizedSelectedOptions(row) {
  const value = row?.selected_options ?? row?.selectedOptions ?? {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([groupId, optionId]) => (
    [String(groupId), String(optionId)]
  )))
}

function selectedOptionsKey(selectedOptions) {
  return Object.keys(selectedOptions)
    .sort()
    .map(groupId => `${groupId}:${selectedOptions[groupId]}`)
    .join('|')
}

function normalizeGuestCartPriceMode(value) {
  return value === PRICE_MODE_REGULAR ? PRICE_MODE_REGULAR : PRICE_MODE_TOURIST
}

function rebuildRow(row, item, lang, priceMode) {
  const selectedOptions = normalizedSelectedOptions(row)
  const optionGroups = publicOptionGroups(item)
  const knownGroupIds = new Set(optionGroups.map(group => group.id))
  if (Object.keys(selectedOptions).some(groupId => !knownGroupIds.has(groupId))) return null

  let basePrice = getOrderItemBasePrice(item)
  for (const group of optionGroups) {
    const selectedId = selectedOptions[group.id]
    if (!selectedId) {
      if (group.required) return null
      continue
    }
    const option = group.options.find(value => value.id === selectedId)
    if (!option) return null
    basePrice = option.price > 0 ? option.price : basePrice + option.priceDelta
  }

  const optionKey = selectedOptionsKey(selectedOptions)
  const cartItemKey = optionKey ? `${item.id}::${optionKey}` : String(item.id)
  const unitPrice = calculateUnitPrice(basePrice, priceMode)
  return {
    ...(optionKey ? { id: cartItemKey, cart_item_key: cartItemKey } : {}),
    menu_item_id: item.id,
    name: getItemName(item, lang),
    price: unitPrice,
    base_price: basePrice,
    unit_price: unitPrice,
    price_mode: priceMode,
    sale_unit: normalizeMenuSaleUnit(item?.sale_unit ?? item?.saleUnit),
    selected_options: selectedOptions,
    quantity: normalizeMenuQuantity(row?.quantity, item),
    notes: String(row?.notes || ''),
  }
}

export function rebuildGuestCartFromCatalog({
  cart = [],
  menuItems = [],
  categories = [],
  now = new Date(),
  lang = 'en',
  priceMode = PRICE_MODE_TOURIST,
} = {}) {
  const normalizedPriceMode = normalizeGuestCartPriceMode(priceMode)
  const visibleCategoryIds = new Set(categories
    .filter(category => (
      isCustomerMenuCategory(category, now) &&
      (normalizedPriceMode !== PRICE_MODE_TOURIST || !isTouristHiddenMenuCategory(category))
    ))
    .map(category => String(category.id)))
  const menuItemMap = new Map(menuItems.flatMap(item => {
    const categoryId = item?.category_id ?? item?.categoryId
    const categoryVisible = !categoryId || visibleCategoryIds.has(String(categoryId))
    const visible = categoryVisible && item?.available === true && isCustomerMenuItem(item, now)
    return visible ? [[String(item.id), item]] : []
  }))
  const rebuilt = new Map()

  for (const storedRow of Array.isArray(cart) ? cart : []) {
    const item = menuItemMap.get(String(storedRow?.menu_item_id ?? storedRow?.menuItemId ?? ''))
    if (!item) continue
    const row = rebuildRow(storedRow, item, lang, normalizedPriceMode)
    if (!row) continue
    const key = row.cart_item_key || String(row.menu_item_id)
    const existing = rebuilt.get(key)
    if (!existing) {
      rebuilt.set(key, row)
      continue
    }
    rebuilt.set(key, {
      ...existing,
      quantity: normalizeMenuQuantity(Number(existing.quantity) + Number(row.quantity), item),
      notes: row.notes || existing.notes,
    })
  }

  return [...rebuilt.values()]
}
