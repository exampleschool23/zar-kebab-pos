const UNIT_CONVERSIONS = {
  g: { unit: 'kg', factor: 0.001 },
  kg: { unit: 'kg', factor: 1 },
  ml: { unit: 'l', factor: 0.001 },
  l: { unit: 'l', factor: 1 },
  piece: { unit: 'piece', factor: 1 },
}

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizedIngredientKey(name, unit) {
  return `${String(name || '').trim().toLocaleLowerCase()}::${unit}`
}

export function normalizeIngredientConsumptionQuantity(quantity, unit) {
  const conversion = UNIT_CONVERSIONS[unit] || { unit: String(unit || ''), factor: 1 }
  return {
    quantity: numberOrZero(quantity) * conversion.factor,
    unit: conversion.unit,
  }
}

export function aggregateIngredientConsumption(orders = []) {
  const ingredientsByKey = new Map()
  let coveredItemCount = 0
  let uncoveredItemCount = 0
  let soldPortionCount = 0

  for (const order of orders || []) {
    if (order?.status === 'cancelled' || order?.payment_status !== 'paid') continue
    for (const item of order?.items || []) {
      if (item?.status === 'cancelled') continue
      const soldQuantity = numberOrZero(item?.quantity)
      if (soldQuantity <= 0) continue
      soldPortionCount += soldQuantity
      const relatedSnapshot = Array.isArray(item?.ingredient_snapshot)
        ? item.ingredient_snapshot[0]
        : item?.ingredient_snapshot
      const snapshot = Array.isArray(relatedSnapshot?.ingredients)
        ? relatedSnapshot.ingredients
        : Array.isArray(item?.tech_card_ingredient_snapshot)
          ? item.tech_card_ingredient_snapshot
          : []
      const validIngredients = snapshot.filter(ingredient => (
        !ingredient?.snapshot_status || ingredient.snapshot_status === 'captured'
      ))
      const snapshotComplete = relatedSnapshot
        ? relatedSnapshot.is_complete === true
        : validIngredients.length === snapshot.length && snapshot.length > 0
      if (!snapshotComplete) {
        uncoveredItemCount += 1
      }
      if (snapshotComplete) coveredItemCount += 1
      for (const ingredient of validIngredients) {
        const name = String(ingredient?.name || '').trim()
        const perPortionQuantity = numberOrZero(ingredient?.quantity_per_portion)
        if (!name || perPortionQuantity <= 0) continue
        const consumed = normalizeIngredientConsumptionQuantity(
          perPortionQuantity * soldQuantity,
          ingredient?.unit,
        )
        const key = normalizedIngredientKey(name, consumed.unit)
        const current = ingredientsByKey.get(key) || {
          name,
          unit: consumed.unit,
          quantity: 0,
          spent: 0,
        }
        current.quantity += consumed.quantity
        current.spent += perPortionQuantity
          * numberOrZero(ingredient?.unit_price_uzs)
          * soldQuantity
        ingredientsByKey.set(key, current)
      }
    }
  }

  const ingredients = [...ingredientsByKey.values()]
    .map(ingredient => ({
      ...ingredient,
      quantity: Math.round(ingredient.quantity * 1000) / 1000,
      spent: Math.round(ingredient.spent),
    }))
    .sort((left, right) => right.spent - left.spent || left.name.localeCompare(right.name))

  return {
    ingredients,
    totalSpent: ingredients.reduce((sum, ingredient) => sum + ingredient.spent, 0),
    coveredItemCount,
    uncoveredItemCount,
    soldPortionCount,
  }
}
