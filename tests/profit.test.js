import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getOrderCostTotal,
  getOrderItemCostPrice,
  getOrderNetProfit,
  getOrderProfitMarginPct,
  getOrdersCostTotal,
  getOrdersNetProfit,
  getSaleProfitSummary,
  hasOrdersCostCoverage,
} from '../src/lib/profit.js'

test('sale profit summary reports unit gain and selling-price margin percentage', () => {
  assert.deepEqual(getSaleProfitSummary(25_000, 10_000), {
    profit: 15_000,
    marginPct: 60,
  })
  assert.deepEqual(getSaleProfitSummary(10_000, 12_500), {
    profit: -2_500,
    marginPct: -25,
  })
  assert.equal(getSaleProfitSummary(0, 0), null)
})

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
  assert.equal(getOrderProfitMarginPct(order), 68)
})

test('order profit margin uses recognized revenue with service loyalty and cancellations', () => {
  const loyaltyOrder = {
    payment_status: 'paid',
    service_rate_pct: 15,
    total: 100_000,
    loyalty_used_amount: 15_000,
    items: [
      { menu_item_id: 'meal', quantity: 1, price: 100_000, cost_price: 40_000, status: 'served' },
      { menu_item_id: 'cancelled', quantity: 1, price: 90_000, cost_price: 80_000, status: 'cancelled' },
    ],
  }
  const discountedOrder = {
    payment_status: 'paid',
    service_rate_pct: 15,
    loyalty_discount_pct: 10,
    total: 103_500,
    items: [
      { menu_item_id: 'meal', quantity: 1, price: 100_000, cost_price: 40_000, status: 'served' },
    ],
  }

  assert.equal(getOrderNetProfit(loyaltyOrder), 75_000)
  assert.equal(getOrderProfitMarginPct(loyaltyOrder), 65.2)
  assert.equal(getOrderNetProfit(discountedOrder), 63_500)
  assert.equal(getOrderProfitMarginPct(discountedOrder), 61.4)
  assert.equal(getOrderProfitMarginPct({ payment_status: 'paid', total: 0, items: [] }), null)
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

test('legacy variant sales use the selected protected variant cost before the parent cost', () => {
  const menuItemMap = {
    qurutoba: {
      id: 'qurutoba',
      cost_price: 40_000,
      variant_costs: {
        one_person: 38_000,
        two_three_people: 72_000,
      },
    },
  }
  const selectedVariant = {
    menu_item_id: 'qurutoba',
    selected_options: { variants: 'two_three_people' },
    cost_price: null,
  }
  const unknownVariant = {
    menu_item_id: 'qurutoba',
    selected_options: { variants: 'four_five_people' },
    cost_price: null,
  }

  assert.equal(getOrderItemCostPrice(selectedVariant, menuItemMap), 72_000)
  assert.equal(getOrderItemCostPrice(unknownVariant, menuItemMap), 40_000)
  assert.equal(getOrderProfitMarginPct({
    payment_status: 'paid',
    service_rate_pct: 0,
    total: 145_000,
    items: [{ ...selectedVariant, quantity: 1, price: 145_000, status: 'served' }],
  }, menuItemMap), 50.3)
})

test('immutable sale snapshots still win after a variant cost changes', () => {
  const item = {
    menu_item_id: 'qurutoba',
    selected_options: { variants: 'two_three_people' },
    cost_price: 65_000,
  }
  const menuItemMap = {
    qurutoba: { cost_price: 40_000, variant_costs: { two_three_people: 72_000 } },
  }

  assert.equal(getOrderItemCostPrice(item, menuItemMap), 65_000)
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
  assert.equal(hasOrdersCostCoverage([order], menuItemMap), true)
})

test('profit coverage rejects unknown sold-item costs without rejecting cancelled rows', () => {
  const soldItem = { menu_item_id: 'legacy', quantity: 1, cost_price: null, status: 'served' }
  const cancelledItem = { menu_item_id: 'cancelled', quantity: 1, cost_price: null, status: 'cancelled' }
  const order = { payment_status: 'paid', total: 50_000, items: [soldItem, cancelledItem] }

  assert.equal(hasOrdersCostCoverage([order]), false)
  assert.equal(hasOrdersCostCoverage([order], {
    legacy: { cost_price: 20_000 },
  }), true)
  assert.equal(hasOrdersCostCoverage([{
    ...order,
    items: [{ ...soldItem, cost_price: 0 }, cancelledItem],
  }]), true)
})
