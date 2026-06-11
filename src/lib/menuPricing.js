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
