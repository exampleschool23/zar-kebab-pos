import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getOrderCostTotal,
  getOrderItemCostPrice,
  getOrderNetProfit,
  getOrdersCostTotal,
  getOrdersNetProfit,
} from '../src/lib/profit.js'

test('net profit subtracts immutable sold-item cost snapshots from paid revenue', () => {
  const order = {
    payment_status: 'paid',
    total: 125_000,
    service_rate_pct: 0,
    items: [
      { menu_item_id: 'kebab', quantity: 2, price: 50_000, cost_price: 18_000, status: 'served' },
      { menu_item_id: 'tea', quantity: 1, price: 25_000, cost_price: 4_000, status: 'served' },
    ],
  }

  assert.equal(getOrderCostTotal(order), 40_000)
  assert.equal(getOrdersCostTotal([order]), 40_000)
  assert.equal(getOrderNetProfit(order), 85_000)
})

test('legacy order items fall back to the protected current menu cost', () => {
  const menuItemMap = new Map([
    ['kebab', { id: 'kebab', cost_price: 21_000 }],
  ])
  const legacyItem = { menu_item_id: 'kebab', quantity: 3, price: 33_333, cost_price: null, status: 'served' }
  const order = { payment_status: 'paid', total: 99_999, service_rate_pct: 0, items: [legacyItem] }

  assert.equal(getOrderItemCostPrice(legacyItem, menuItemMap), 21_000)
  assert.equal(getOrderCostTotal(order, menuItemMap), 63_000)
  assert.equal(getOrderNetProfit(order, menuItemMap), 36_999)
})

test('explicit zero snapshots stay historical and cancelled items do not reduce profit', () => {
  const menuItemMap = {
    kebab: { id: 'kebab', cost_price: 22_000 },
    cancelled: { id: 'cancelled', cost_price: 99_000 },
  }
  const order = {
    payment_status: 'paid',
    total: 50_000,
    service_rate_pct: 0,
    items: [
      { menu_item_id: 'kebab', quantity: 1, price: 50_000, cost_price: 0, status: 'served' },
      { menu_item_id: 'cancelled', quantity: 1, price: 99_000, cost_price: null, status: 'cancelled' },
    ],
  }

  assert.equal(getOrderCostTotal(order, menuItemMap), 0)
  assert.equal(getOrdersNetProfit([order], menuItemMap), 50_000)
})
