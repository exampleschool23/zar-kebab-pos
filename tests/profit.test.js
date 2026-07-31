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

test('sale profit summary reports unit gain, selling-price margin, and cost markup percentages', () => {
  assert.deepEqual(getSaleProfitSummary(25_000, 10_000), {
    profit: 15_000,
    marginPct: 60,
    markupPct: 150,
  })
  assert.deepEqual(getSaleProfitSummary(10_000, 12_500), {
    profit: -2_500,
    marginPct: -25,
    markupPct: -20,
  })
  assert.deepEqual(getSaleProfitSummary(12_000, 4_166), {
    profit: 7_834,
    marginPct: 65.3,
    markupPct: 188,
  })
  assert.deepEqual(getSaleProfitSummary(10_000, 0), {
    profit: 10_000,
    marginPct: 100,
    markupPct: null,
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

  assert.equal(getOrderNetProfit(loyaltyOrder), 60_000)
  assert.equal(getOrderProfitMarginPct(loyaltyOrder), 60)
  assert.equal(getOrderNetProfit(discountedOrder), 63_500)
  assert.equal(getOrderProfitMarginPct(discountedOrder), 61.4)
  assert.equal(getOrderProfitMarginPct({ payment_status: 'paid', total: 0, items: [] }), null)
})

test('an order with no captured cost never reads a later current menu cost', () => {
  const menuItemMap = new Map([
    ['kebab', { id: 'kebab', cost_price: 21_000 }],
  ])
  const legacyItem = { menu_item_id: 'kebab', quantity: 3, price: 33_333, cost_price: null, status: 'served' }
  const order = { payment_status: 'paid', total: 99_999, service_rate_pct: 0, items: [legacyItem] }

  assert.equal(getOrderItemCostPrice(legacyItem, menuItemMap), 0)
  assert.equal(getOrderCostTotal(order, menuItemMap), 0)
  assert.equal(getOrderNetProfit(order, menuItemMap), 99_999)
})

test('captured variant cost stays fixed after both variant and parent costs change', () => {
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
    cost_price: 65_000,
  }

  assert.equal(getOrderItemCostPrice(selectedVariant, menuItemMap), 65_000)
  assert.equal(getOrderProfitMarginPct({
    payment_status: 'paid',
    service_rate_pct: 0,
    total: 145_000,
    items: [{ ...selectedVariant, quantity: 1, price: 145_000, status: 'served' }],
  }, menuItemMap), 55.2)
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

test('menu price and real-cost changes affect future orders without rewriting previous profit', () => {
  const previousOrder = {
    payment_status: 'paid',
    total: 50_000,
    service_rate_pct: 0,
    items: [{
      menu_item_id: 'kebab',
      quantity: 1,
      price: 50_000,
      cost_price: 18_000,
      status: 'served',
    }],
  }
  const futureOrder = {
    payment_status: 'paid',
    total: 70_000,
    service_rate_pct: 0,
    items: [{
      menu_item_id: 'kebab',
      quantity: 1,
      price: 70_000,
      cost_price: 25_000,
      status: 'served',
    }],
  }
  const editedMenu = {
    kebab: { price: 70_000, old_price: 60_000, cost_price: 25_000 },
  }

  assert.equal(getOrderNetProfit(previousOrder, editedMenu), 32_000)
  assert.equal(getOrderNetProfit(futureOrder, editedMenu), 45_000)
})

test('archiving or removing current menu lookup data cannot change historical profit', () => {
  const order = {
    payment_status: 'paid',
    total: 50_000,
    service_rate_pct: 0,
    items: [{
      menu_item_id: 'retired-kebab',
      quantity: 1,
      price: 50_000,
      cost_price: 18_000,
      status: 'served',
    }],
  }
  const archivedMenu = {
    'retired-kebab': {
      id: 'retired-kebab',
      cost_price: 99_000,
      available: false,
      deleted_at: '2026-08-01T10:00:00.000Z',
    },
  }

  assert.equal(getOrderNetProfit(order, archivedMenu), 32_000)
  assert.equal(getOrderNetProfit(order, {}), 32_000)
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
  }), false)
  assert.equal(hasOrdersCostCoverage([{
    ...order,
    items: [{ ...soldItem, cost_price: 0 }, cancelledItem],
  }]), true)
})
