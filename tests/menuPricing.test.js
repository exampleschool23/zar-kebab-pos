import { getMenuItemForPriceMode } from '../src/lib/priceModes.js'
import { getOrderPaymentSummary } from '../src/lib/analytics.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { getMenuPricing, getMenuOptionPricing, getSelectedMenuBasePrice } from '../src/lib/menuPricing.js'

test('menu pricing treats old_price above price as a display discount', () => {
  assert.deepEqual(getMenuPricing({ price: 35000, old_price: 40000 }), {
    price: 35000,
    oldPrice: 40000,
    discounted: true,
  })
})

test('menu pricing ignores missing or non-discount old prices', () => {
  assert.deepEqual(getMenuPricing({ price: 40000, old_price: 35000 }), {
    price: 40000,
    oldPrice: 0,
    discounted: false,
  })
  assert.deepEqual(getMenuPricing({ price: 40000 }), {
    price: 40000,
    oldPrice: 0,
    discounted: false,
  })
})

const ayran = { price: 10000, old_price: 15000 }
const sizes = [{ id: 'size', required: true, options: [
  { id: '300', price: 10000 },
  { id: '500', price: 20000 },
] }]

test('Ayran card exposes variant prices and selected detail agrees with cart and service total', () => {
  assert.deepEqual(getMenuOptionPricing(ayran, sizes), {
    price: 10000, maxPrice: 20000, oldPrice: 0, discounted: false,
  })
  const selected = { size: '500' }
  const basePrice = getSelectedMenuBasePrice(ayran, sizes, selected)
  const displayed = getMenuOptionPricing(ayran, sizes, selected)
  assert.equal(basePrice, 20000)
  assert.equal(displayed.price, basePrice)
  assert.equal(displayed.maxPrice, basePrice)
  const summary = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15 }, [
    { price: basePrice, unit_price: basePrice, quantity: 1 },
  ])
  assert.equal(summary.subtotal, displayed.price)
  assert.equal(summary.total, 23000)
})

test('variant display applies Tourist markup once, including after mode reprojection', () => {
  const tourist = getMenuItemForPriceMode(ayran, 'tourist')
  assert.equal(getMenuOptionPricing(tourist, sizes).maxPrice, 24000)
  assert.equal(getMenuOptionPricing(tourist, sizes, { size: '300' }).price, 12000)
  assert.equal(getMenuOptionPricing(getMenuItemForPriceMode(tourist, 'regular'), sizes).maxPrice, 20000)
})

test('range uses only supplied visible options and supports required, optional and additive prices', () => {
  assert.equal(getMenuOptionPricing(ayran, [{ ...sizes[0], options: [sizes[0].options[1]] }]).price, 20000)
  const groups = [...sizes, { id: 'extra', required: false, options: [{ id: 'ice', price_delta: 3000 }] }]
  assert.equal(getMenuOptionPricing(ayran, groups).price, 10000)
  assert.equal(getMenuOptionPricing(ayran, groups).maxPrice, 23000)
  assert.equal(getSelectedMenuBasePrice(ayran, groups, { size: '500', extra: 'ice' }), 23000)
  const optional = [{ ...sizes[0], required: false, options: [{ id: '500', price: 20000 }] }]
  assert.equal(getMenuOptionPricing(ayran, optional).price, 10000)
  assert.equal(getMenuOptionPricing(ayran, optional, {}).price, 10000)
})

test('plain products retain discount display and empty option groups are safe', () => {
  assert.deepEqual(getMenuOptionPricing(ayran, []), { ...getMenuPricing(ayran), maxPrice: 10000 })
  assert.equal(getMenuOptionPricing(ayran, [{ id: 'size', required: true, options: [] }]).price, 10000)
})
