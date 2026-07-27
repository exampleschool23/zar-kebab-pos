import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  changeMenuQuantity,
  formatMenuQuantity,
  isMenuItemSoldByWeight,
  menuPriceUnitSuffix,
  normalizeMenuQuantity,
} from '../src/lib/menuSaleUnits.js'
import { cartReducer } from '../src/store/cartReducer.js'
import { getOrderPaymentSummary } from '../src/lib/analytics.js'
import { getOrderCostTotal } from '../src/lib/profit.js'

const kgItem = { id: 'lamb-neck', menu_item_id: 'lamb-neck', sale_unit: 'kg' }

test('kilogram menu quantities preserve up to three decimal places', () => {
  assert.equal(normalizeMenuQuantity(1.5754, kgItem), 1.575)
  assert.equal(changeMenuQuantity(1.5, kgItem, 1), 1.6)
  assert.equal(changeMenuQuantity(0.1, kgItem, -1), 0)
  assert.equal(formatMenuQuantity(1.5, kgItem), '1.5 kg')
  assert.equal(menuPriceUnitSuffix(kgItem, 'ru'), ' / кг')
  assert.equal(isMenuItemSoldByWeight(kgItem), true)
})

test('piece quantities remain positive whole numbers', () => {
  assert.equal(normalizeMenuQuantity(1.6, { sale_unit: 'piece' }), 2)
  assert.equal(normalizeMenuQuantity(0, { sale_unit: 'piece' }), 1)
  assert.equal(formatMenuQuantity(2, { sale_unit: 'piece' }), '2')
})

test('cart reducer retains decimal weight and increments weighted products by the submitted amount', () => {
  const initial = { cart: [] }
  const added = cartReducer(initial, {
    type: 'ADD_TO_CART',
    payload: { ...kgItem, price: 190000, quantity: 1.5 },
  })
  assert.equal(added.cart[0].quantity, 1.5)

  const incremented = cartReducer(added, {
    type: 'ADD_TO_CART',
    payload: { ...kgItem, price: 190000, quantity: 0.25 },
  })
  assert.equal(incremented.cart[0].quantity, 1.75)
})

test('payment and profit calculations multiply per-kilogram price and cost by decimal weight', () => {
  const item = {
    ...kgItem,
    price: 190000,
    unit_price: 190000,
    quantity: 1.5,
    cost_price: 100000,
    status: 'served',
  }
  const order = { order_type: 'take_away', service_rate_pct: 0, items: [item] }

  assert.equal(getOrderPaymentSummary(order, [item], 0).total, 285000)
  assert.equal(getOrderCostTotal(order), 150000)
})

test('weight migration stores decimal quantities and keeps payment RPC calculations decimal-safe', () => {
  const sql = readFileSync(new URL('../supabase/105_menu_items_sold_by_weight.sql', import.meta.url), 'utf8')
  assert.match(sql, /add column if not exists sale_unit text not null default 'piece'/)
  assert.match(sql, /alter column quantity type numeric\(12,3\)/)
  assert.match(sql, /quantity numeric,/)
  assert.match(sql, /settle_orders_payment\(jsonb\)/)
  assert.match(sql, /to_regprocedure\('public\.settle_orders_payment_strict\(jsonb\)'\)/)
  assert.match(sql, /reopen_paid_orders_owner\(text\[\]\)/)
  assert.match(sql, /target_function is not null/)
  assert.match(sql, /elsif position\('quantity numeric,' in function_definition\) = 0/)
  assert.match(sql, /order_items_quantity_matches_sale_unit/)
  assert.match(sql, /alter column sale_unit type text using/)
  assert.doesNotMatch(
    sql,
    /update public\.order_items(?:\s+\w+)?\s+set sale_unit/i,
    'legacy sale-unit normalization must not fire the paid-order item guard',
  )
})
