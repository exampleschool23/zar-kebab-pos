import test from 'node:test'
import assert from 'node:assert/strict'
import { getMenuPricing } from '../src/lib/menuPricing.js'

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
