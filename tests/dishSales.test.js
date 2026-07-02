import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALL_DISHES_KEY,
  getDishSalesAnalysis,
  getMenuDishSalesKey,
} from '../src/lib/dishSales.js'

const menuItems = [
  { id: 'kebab', name_en: 'Kebab', category_id: 'grill', image_url: 'kebab.jpg', available: true },
  { id: 'lagman', name_en: 'Lagman', category_id: 'soup', image_url: 'lagman.jpg', available: true },
  { id: 'salad', name_en: 'Salad', category_id: 'salad', image_url: 'salad.jpg', available: true },
]

function order({ id, paidAt, items, waiter = 'Aziz', table = 'T1', orderType = 'dine_in' }) {
  return {
    id,
    paid_at: paidAt,
    created_at: paidAt,
    payment_status: 'paid',
    status: 'paid',
    waiter_name: waiter,
    table_name: table,
    order_type: orderType,
    items,
  }
}

function item(overrides = {}) {
  return {
    id: overrides.id || 'row',
    menu_item_id: overrides.menu_item_id || 'kebab',
    name: overrides.name || 'Kebab',
    quantity: overrides.quantity ?? 1,
    price: overrides.price ?? 25000,
    status: overrides.status || 'served',
    ...overrides,
  }
}

test('dish sales analysis keeps zero-sale menu items visible for removal decisions', () => {
  const analysis = getDishSalesAnalysis({
    orders: [
      order({
        id: 'o1',
        paidAt: '2026-05-19T10:00:00.000Z',
        items: [item({ menu_item_id: 'kebab', quantity: 2, price: 25000 })],
      }),
    ],
    menuItems,
  })

  const salad = analysis.dishes.find(row => row.menuItemId === 'salad')

  assert.equal(salad.quantity, 0)
  assert.equal(salad.revenue, 0)
  assert.equal(salad.orders, 0)
  assert.equal(analysis.dishes[0].menuItemId, 'lagman')
  assert.equal(analysis.dishes[1].menuItemId, 'salad')
})

test('selected dish report excludes cancelled rows and buckets sale time in restaurant timezone', () => {
  const selectedDishKey = getMenuDishSalesKey(menuItems[0])
  const analysis = getDishSalesAnalysis({
    orders: [
      order({
        id: 'late',
        paidAt: '2026-05-19T19:30:00.000Z',
        items: [
          item({ id: 'k1', quantity: 2, price: 25000 }),
          item({ id: 'cancelled', quantity: 7, price: 25000, status: 'cancelled' }),
        ],
      }),
      order({
        id: 'early',
        paidAt: '2026-05-20T06:00:00.000Z',
        items: [item({ id: 'k2', quantity: 1, price: 30000 })],
      }),
      order({
        id: 'other',
        paidAt: '2026-05-20T07:00:00.000Z',
        items: [item({ menu_item_id: 'lagman', name: 'Lagman', quantity: 5, price: 32000 })],
      }),
    ],
    menuItems,
    selectedDishKey,
  })

  assert.equal(analysis.selectedDish.menuItemId, 'kebab')
  assert.equal(analysis.totals.quantity, 3)
  assert.equal(analysis.totals.revenue, 80000)
  assert.equal(analysis.totals.orders, 2)
  assert.deepEqual(analysis.daily.map(row => [row.date, row.quantity]), [
    ['2026-05-20', 3],
  ])
  assert.deepEqual(analysis.hourly.map(row => [row.hour, row.quantity]), [
    [0, 2],
    [11, 1],
  ])
})

test('dish sales analysis keeps deleted menu item sales by item name', () => {
  const analysis = getDishSalesAnalysis({
    orders: [
      order({
        id: 'legacy',
        paidAt: '2026-05-19T10:00:00.000Z',
        items: [item({ menu_item_id: null, name: 'Old Soup', quantity: 4, price: 18000 })],
      }),
    ],
    menuItems,
    selectedDishKey: ALL_DISHES_KEY,
  })

  const legacy = analysis.dishes.find(row => row.name === 'Old Soup')

  assert.equal(legacy.currentMenuItem, false)
  assert.equal(legacy.quantity, 4)
  assert.equal(legacy.revenue, 72000)
})
