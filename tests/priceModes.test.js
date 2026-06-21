import test from 'node:test'
import assert from 'node:assert/strict'

import { getOrderPaymentSummary } from '../src/lib/analytics.js'
import {
  calculateUnitPrice,
  getMenuItemForPriceMode,
  normalizePriceMode,
} from '../src/lib/priceModes.js'
import { cartReducer } from '../src/store/cartReducer.js'
import { ordersReducer } from '../src/store/ordersReducer.js'

function baseState(overrides = {}) {
  return {
    settings: { serviceRate: 15 },
    user: { name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 1', status: 'available' }],
    orders: [],
    cart: [],
    ...overrides,
  }
}

test('tourist prices add 20 percent and round to nearest 1000 UZS', () => {
  assert.equal(normalizePriceMode('unknown'), 'regular')
  assert.equal(calculateUnitPrice(25000, 'regular'), 25000)
  assert.equal(calculateUnitPrice(25000, 'tourist'), 30000)
  assert.equal(calculateUnitPrice(22200, 'tourist'), 27000)
  assert.equal(calculateUnitPrice(25500, 'tourist'), 31000)
})

test('menu item price mode projection keeps the original base price', () => {
  const item = getMenuItemForPriceMode({ id: 'beef', price: 30000 }, 'tourist')
  assert.equal(item.base_price, 30000)
  assert.equal(item.unit_price, 36000)
  assert.equal(item.price, 36000)
  assert.equal(item.price_mode, 'tourist')
})

test('payment summaries prefer saved unit_price over legacy price', () => {
  const summary = getOrderPaymentSummary(
    { order_type: 'dine_in', service_rate_pct: 0 },
    [{ id: 'i1', menu_item_id: 'beef', price: 30000, base_price: 30000, unit_price: 36000, quantity: 2 }]
  )
  assert.equal(summary.subtotal, 72000)
  assert.equal(summary.total, 72000)
})

test('cart price mode update recalculates existing cart rows', () => {
  const state = {
    cart: [{ menu_item_id: 'beef', name: 'Beef Shashlik', price: 30000, base_price: 30000, unit_price: 30000, quantity: 1 }],
  }
  const next = cartReducer(state, { type: 'UPDATE_CART_PRICE_MODE', payload: { priceMode: 'tourist' } })
  assert.equal(next.cart[0].base_price, 30000)
  assert.equal(next.cart[0].unit_price, 36000)
  assert.equal(next.cart[0].price, 36000)
  assert.equal(next.cart[0].price_mode, 'tourist')
})

test('send to kitchen saves base price, unit price, and price mode', () => {
  const sent = ordersReducer(baseState({
    cart: [{ menu_item_id: 'beef', name: 'Beef Shashlik', price: 36000, base_price: 30000, unit_price: 36000, price_mode: 'tourist', quantity: 2 }],
  }), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'o1',
    payload: { orderType: 'dine_in', priceMode: 'tourist' },
  })

  assert.equal(sent.orders[0].price_mode, 'tourist')
  assert.equal(sent.orders[0].subtotal, 72000)
  assert.equal(sent.orders[0].items[0].base_price, 30000)
  assert.equal(sent.orders[0].items[0].unit_price, 36000)
  assert.equal(sent.orders[0].items[0].price_mode, 'tourist')
})

test('changing price mode recalculates unpaid current order items only', () => {
  const state = baseState({
    orders: [
      {
        id: 'open',
        table_id: 't1',
        payment_status: 'unpaid',
        order_type: 'dine_in',
        service_rate_pct: 0,
        price_mode: 'regular',
        items: [{ id: 'i1', menu_item_id: 'beef', price: 30000, base_price: 30000, unit_price: 30000, quantity: 1, status: 'served' }],
      },
      {
        id: 'paid',
        table_id: 't1',
        payment_status: 'paid',
        order_type: 'dine_in',
        service_rate_pct: 0,
        price_mode: 'regular',
        items: [{ id: 'i2', menu_item_id: 'beef', price: 30000, base_price: 30000, unit_price: 30000, quantity: 1, status: 'served' }],
      },
    ],
  })

  const next = ordersReducer(state, {
    type: 'UPDATE_ORDER_PRICE_MODE',
    payload: { tableId: 't1', priceMode: 'tourist' },
  })

  assert.equal(next.orders.find(o => o.id === 'open').price_mode, 'tourist')
  assert.equal(next.orders.find(o => o.id === 'open').items[0].unit_price, 36000)
  assert.equal(next.orders.find(o => o.id === 'open').subtotal, 36000)
  assert.equal(next.orders.find(o => o.id === 'paid').price_mode, 'regular')
  assert.equal(next.orders.find(o => o.id === 'paid').items[0].unit_price, 30000)
})
