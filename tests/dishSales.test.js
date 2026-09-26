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


test('archived products retain sales and names but are excluded from current low sellers', () => {
  const archived = { ...menuItems[0], deleted_at: '2026-09-24T00:00:00Z' }
  const analysis = getDishSalesAnalysis({
    menuItems: [archived, menuItems[1]],
    orders: [order({ id: 'history', paidAt: '2026-09-01T10:00:00Z', items: [item({ quantity: 2 })] })],
  })
  const dish = analysis.dishes.find(row => row.menuItemId === 'kebab')
  assert.equal(dish.currentMenuItem, false)
  assert.equal(dish.name, 'Kebab')
  assert.equal(dish.quantity, 2)
  assert.equal(dish.revenue, 50000)
  assert.deepEqual(analysis.dishes.filter(row => row.currentMenuItem).map(row => row.menuItemId), ['lagman'])
})

test('reconciliation uses saved service and loyalty and exposes unexplained differences', async () => {
  const { getDishRevenueReconciliation } = await import('../src/lib/dishSales.js')
  const paid = { ...order({ id: 'paid', items: [item({ price: 100000 })] }), total: 110000, service_fee: 20000, loyalty_used_amount: 10000 }
  assert.deepEqual(getDishRevenueReconciliation([paid]), { items: 100000, service: 20000, loyalty: 10000, collected: 110000, missingSnapshots: 0, difference: 0 })
  assert.equal(getDishRevenueReconciliation([{ ...paid, total: 111000 }]).difference, 1000)
  const incomplete = getDishRevenueReconciliation([{ ...paid, service_fee: null }])
  assert.equal(incomplete.missingSnapshots, 1)
  assert.equal(incomplete.service, 0)
  assert.equal(incomplete.difference, 20000)
  assert.equal(getDishRevenueReconciliation([{ ...paid, status: 'cancelled' }]).collected, 0)
})

test('selected dish includes frozen set portions, deduplicates orders and preserves revenue', () => {
  const included = { menu_item_id: 'kebab', name_en: 'Kebab', quantity: 2 }
  const orders = [
    order({ id: 'both', paidAt: '2026-09-26T06:00:00Z', items: [
      item({ quantity: 3 }),
      item({ menu_item_id: 'set', name: 'Shashlik lovers', quantity: 2, price: 100000, tech_card_component_snapshot: [included] }),
      item({ menu_item_id: 'set', quantity: 9, status: 'cancelled', tech_card_component_snapshot: [included] }),
    ] }),
    order({ id: 'set-only', paidAt: '2026-09-26T08:00:00Z', items: [
      item({ menu_item_id: 'small-set', name: 'Small set', quantity: 3, price: 50000, tech_card_component_snapshot: [{ ...included, quantity: 0.5 }] }),
    ] }),
  ]
  const analysis = getDishSalesAnalysis({ orders, menuItems, selectedDishKey: 'menu:kebab' })
  assert.equal(analysis.totals.quantity, 8.5)
  assert.equal(analysis.totals.directQuantity, 3)
  assert.equal(analysis.totals.includedQuantity, 5.5)
  assert.equal(analysis.totals.orders, 2)
  assert.equal(analysis.totals.averagePerOrder, 4.25)
  assert.equal(analysis.totals.revenue, 75000)
  assert.equal(analysis.totals.lastSoldAt, '2026-09-26T08:00:00Z')
  assert.deepEqual(analysis.hourly.map(row => [row.hour, row.quantity]), [[11, 7], [13, 1.5]])
  assert.deepEqual(analysis.sources.map(row => [row.name, row.quantity]), [['Shashlik lovers', 4], ['Kebab', 3], ['Small set', 1.5]])
  assert.equal(analysis.sales.filter(row => row.includedInSet).length, 2)
  const all = getDishSalesAnalysis({ orders, menuItems })
  assert.equal(all.totals.quantity, 8)
  assert.equal(all.totals.revenue, 425000)
  const set = getDishSalesAnalysis({ orders, menuItems, selectedDishKey: 'menu:set' })
  assert.equal(set.totals.quantity, 2)
  assert.equal(set.totals.includedQuantity, 0)
})

test('set-only archived dish uses snapshot identity and ignores invalid or missing contents', () => {
  const orders = [order({ id: 'old', paidAt: '2026-09-26T06:00:00Z', items: [
    item({ tech_card_component_snapshot: [
      { menu_item_id: 'archived', name_en: 'Old samsa', quantity: 2 },
      { menu_item_id: 'archived', quantity: 0 },
      { menu_item_id: 'archived', quantity: -2 },
      { menu_item_id: 'archived', quantity: 'bad' },
    ] }),
    item({ tech_card_component_snapshot: null }),
    item({ tech_card_component_snapshot: {} }),
  ] })]
  const analysis = getDishSalesAnalysis({ orders, selectedDishKey: 'menu:archived' })
  assert.equal(analysis.selectedDish.name, 'Old samsa')
  assert.equal(analysis.selectedDish.currentMenuItem, false)
  assert.equal(analysis.totals.quantity, 2)
  assert.equal(analysis.totals.revenue, 0)
  assert.equal(analysis.totals.orders, 1)
  const empty = getDishSalesAnalysis({ orders, menuItems, selectedDishKey: 'menu:salad' })
  assert.equal(empty.totals.quantity, 0)
  assert.deepEqual(empty.sources, [])
  assert.deepEqual(empty.hourly, [])
})
