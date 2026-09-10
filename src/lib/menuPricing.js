import { calculateUnitPrice, getOrderItemBasePrice } from './priceModes.js'

export function getSelectedMenuBasePrice(item, optionGroups, selectedOptions = {}) {
  return optionGroups.reduce((price, group) => {
    const option = group.options.find(row => row.id === selectedOptions[group.id])
    return Number(option?.price) > 0 ? Number(option.price) : price + (Number(option?.price_delta) || 0)
  }, getOrderItemBasePrice(item))
}

// Groups are already filtered for the current audience and availability.
export function getMenuOptionPricing(item, optionGroups, selectedOptions = null) {
  const basePricing = getMenuPricing(item)
  if (!optionGroups.length) return { ...basePricing, maxPrice: basePricing.price }
  let min = getOrderItemBasePrice(item)
  let max = min
  if (selectedOptions !== null) {
    min = max = getSelectedMenuBasePrice(item, optionGroups, selectedOptions)
  } else {
    for (const group of optionGroups) {
      const choices = group.required ? group.options : [null, ...group.options]
      if (!choices.length) continue
      const nextPrice = (price, option) => Number(option?.price) > 0
        ? Number(option.price) : price + (Number(option?.price_delta) || 0)
      min = Math.min(...choices.map(option => nextPrice(min, option)))
      max = Math.max(...choices.map(option => nextPrice(max, option)))
    }
  }
  const mode = item.price_mode || item.priceMode
  const price = calculateUnitPrice(min, mode)
  const maxPrice = calculateUnitPrice(max, mode)
  // A parent's old price is not a discount on a different variant.
  return { price, maxPrice, oldPrice: 0, discounted: false }
}

export function getMenuPricing(item = {}) {
  const price = Math.max(0, Number(item.price) || 0)
  const oldPrice = Math.max(0, Number(item.old_price ?? item.oldPrice) || 0)
  const discounted = oldPrice > price && price > 0
  return {
    price,
    oldPrice: discounted ? oldPrice : 0,
    discounted,
  }
}
