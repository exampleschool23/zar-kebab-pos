import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BAZAAR_ENTRY_CATEGORIES,
  BAZAAR_ENTRY_PAYMENT_METHODS,
  BAZAAR_ENTRY_UNITS,
  BAZAAR_PAYMENT_METHODS,
  BAZAAR_UNITS,
  bazaarRangeDayCount,
  calculateBazaarTotal,
  filterBazaarPurchases,
  getBazaarPurchaseScopedItems,
  getBazaarPurchaseScopedTotal,
  getBazaarRange,
  getBazaarSubmissionAttempt,
  getBazaarUnitCost,
  normalizeBazaarMoney,
  normalizeBazaarProductKey,
  normalizeBazaarQuantity,
  normalizeBazaarQuantityToBase,
  summarizeBazaarPurchases,
  validateBazaarPurchase,
} from '../src/lib/bazaar.js'

function purchase(id, date, paymentMethod, _legacySupplier, items, overrides = {}) {
  return {
    id,
    purchase_date: date,
    payment_method: paymentMethod,
    buyer_name: 'Ali',
    bazaar_purchase_items: items.map((item, index) => ({ sort_order: index, ...item })),
    ...overrides,
  }
}

test('daily bazaar normalizes product names, decimal quantities, money, and compatible base units', () => {
  assert.equal(normalizeBazaarProductKey('  Red   Onion  '), 'red onion')
  assert.equal(normalizeBazaarProductKey('Go‘sht'), normalizeBazaarProductKey("Go'sht"))
  assert.equal(normalizeBazaarQuantity('2,375'), 2.375)
  assert.equal(normalizeBazaarMoney('1 250 000'), 1_250_000)
  assert.deepEqual(normalizeBazaarQuantityToBase(500, 'g'), { quantity: 0.5, unit: 'kg' })
  assert.deepEqual(normalizeBazaarQuantityToBase(750, 'ml'), { quantity: 0.75, unit: 'l' })
  assert.equal(BAZAAR_UNITS.some(unit => unit.key === 'entry'), false)
  assert.equal(BAZAAR_ENTRY_UNITS.some(unit => unit.key === 'entry'), false)
  assert.equal(BAZAAR_PAYMENT_METHODS.some(method => method.key === 'terminal'), true)
  assert.equal(BAZAAR_ENTRY_PAYMENT_METHODS.some(method => method.key === 'terminal'), false)
  assert.equal(BAZAAR_ENTRY_CATEGORIES.some(category => category.key === 'other'), false)
})

test('daily bazaar quick ranges are inclusive and handle month/year boundaries', () => {
  assert.deepEqual(getBazaarRange('today', '2026-07-17'), { dateFrom: '2026-07-17', dateTo: '2026-07-17' })
  assert.deepEqual(getBazaarRange('week', '2026-07-17'), { dateFrom: '2026-07-11', dateTo: '2026-07-17' })
  assert.deepEqual(getBazaarRange('month', '2026-07-17'), { dateFrom: '2026-07-01', dateTo: '2026-07-17' })
  assert.deepEqual(getBazaarRange('previousMonth', '2026-01-08'), { dateFrom: '2025-12-01', dateTo: '2025-12-31' })
  assert.deepEqual(getBazaarRange('previousMonth', '2024-03-01'), { dateFrom: '2024-02-01', dateTo: '2024-02-29' })
})

test('calendar-day averages stay inclusive across daylight-saving boundaries', () => {
  const previousTimezone = process.env.TZ
  try {
    process.env.TZ = 'America/New_York'
    assert.equal(bazaarRangeDayCount('2026-03-07', '2026-03-08'), 2)
    assert.equal(bazaarRangeDayCount('2026-11-01', '2026-11-02'), 2)
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('daily bazaar validation requires exact paid lines and whole count-like quantities', () => {
  const valid = validateBazaarPurchase({
    purchase_date: '2026-07-17',
    payment_method: 'cash',
    buyer_profile_id: '00000000-0000-0000-0000-000000000001',
    items: [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: '2,25', unit: 'kg', line_total: '45 000' },
      { product_name: 'Oil', category: 'grocery', quantity: '3', unit: 'bottle', line_total: '90 000' },
    ],
  })

  assert.equal(valid.valid, true)
  assert.equal(valid.total, 135_000)
  assert.equal(calculateBazaarTotal(valid.purchase.items), 135_000)

  const fractionalCount = validateBazaarPurchase({
    purchase_date: '2026-07-17',
    payment_method: 'cash',
    buyer_profile_id: '00000000-0000-0000-0000-000000000001',
    items: [{ product_name: 'Oil', category: 'grocery', quantity: '1.5', unit: 'bottle', line_total: 30_000 }],
  })
  assert.equal(fractionalCount.valid, false)
  assert.equal(fractionalCount.errors.some(error => error.code === 'quantity_must_be_whole'), true)

  const excessivePrecision = validateBazaarPurchase({
    purchase_date: '2026-07-17',
    payment_method: 'cash',
    buyer_profile_id: '00000000-0000-0000-0000-000000000001',
    items: [{ product_name: 'Spice', category: 'spices', quantity: '0.1234', unit: 'kg', line_total: 10_000 }],
  })
  assert.equal(excessivePrecision.errors.some(error => error.code === 'quantity_precision'), true)

  const historicalOnlyValues = validateBazaarPurchase({
    purchase_date: '2026-07-17',
    payment_method: 'terminal',
    buyer_profile_id: '00000000-0000-0000-0000-000000000001',
    items: [{ product_name: 'Legacy total', category: 'other', quantity: 1, unit: 'entry', line_total: 10_000 }],
  })
  assert.equal(historicalOnlyValues.valid, false)
  assert.equal(historicalOnlyValues.errors.some(error => error.code === 'payment_method_required'), true)
  assert.equal(historicalOnlyValues.errors.some(error => error.code === 'category_required'), true)
  assert.equal(historicalOnlyValues.errors.some(error => error.code === 'unit_required'), true)

  const missingBuyer = validateBazaarPurchase({
    purchase_date: '2026-07-17',
    payment_method: 'cash',
    items: [{ product_name: 'Tomatoes', category: 'vegetables', quantity: 1, unit: 'kg', line_total: 10_000 }],
  })
  assert.equal(missingBuyer.errors.some(error => error.code === 'buyer_profile_id_required'), true)
})

test('daily bazaar filters history by inclusive dates, product search, category, and payment method', () => {
  const rows = [
    purchase('one', '2026-07-10', 'cash', 'Mavtuna', [
      { product_name: 'Red tomatoes', category: 'vegetables', quantity: 2, unit: 'kg', line_total: 40_000 },
    ]),
    purchase('two', '2026-07-11', 'card', 'Bek', [
      { product_name: 'Sunflower oil', category: 'grocery', quantity: 2, unit: 'l', line_total: 60_000 },
    ]),
    purchase('outside', '2026-06-30', 'cash', 'Mavtuna', [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: 1, unit: 'kg', line_total: 20_000 },
    ]),
  ]

  assert.deepEqual(filterBazaarPurchases(rows, { dateFrom: '2026-07-01', dateTo: '2026-07-31' }).map(row => row.id), ['two', 'one'])
  assert.deepEqual(filterBazaarPurchases(rows, { query: 'TOMATO' }).map(row => row.id), ['one', 'outside'])
  assert.deepEqual(filterBazaarPurchases(rows, { query: 'R-one' }).map(row => row.id), [])
  assert.deepEqual(filterBazaarPurchases(rows, { category: 'grocery' }).map(row => row.id), ['two'])
  assert.deepEqual(filterBazaarPurchases(rows, { paymentMethod: 'card' }).map(row => row.id), ['two'])
})

test('daily bazaar product search shows only matching lines and their subtotal', () => {
  const mixedReceipt = purchase('mixed', '2026-07-10', 'cash', 'Mavtuna', [
    { product_name: 'Frozen meat', category: 'meat', quantity: 10, unit: 'kg', line_total: 900_000 },
    { product_name: 'Charvi', category: 'meat', quantity: 5, unit: 'kg', line_total: 150_000 },
    { product_name: 'Oil', category: 'grocery', quantity: 2, unit: 'l', line_total: 60_000 },
  ], {
    buyer_name: 'Ali',
    created_by_name: 'Dilja',
    notes: 'Morning bazaar',
  })

  assert.deepEqual(
    getBazaarPurchaseScopedItems(mixedReceipt, 'all', 'charvi').map(item => item.product_name),
    ['Charvi'],
  )
  assert.equal(getBazaarPurchaseScopedTotal(mixedReceipt, 'all', 'charvi'), 150_000)
  assert.deepEqual(
    getBazaarPurchaseScopedItems(mixedReceipt, 'meat', 'ali').map(item => item.product_name),
    ['Frozen meat', 'Charvi'],
  )
  assert.deepEqual(filterBazaarPurchases([mixedReceipt], { category: 'grocery', query: 'charvi' }), [])
})

test('daily bazaar analytics reconcile spend and normalize grams/millilitres without mixing units', () => {
  const rows = [
    purchase('one', '2026-07-10', 'cash', 'Mavtuna', [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: 2, unit: 'kg', line_total: 40_000 },
      { product_name: 'Oil', category: 'grocery', quantity: 2, unit: 'l', line_total: 60_000 },
    ], { created_at: '2026-07-10T08:00:00+05:00' }),
    purchase('two', '2026-07-11', 'card', 'Mavtuna', [
      { product_name: ' tomatoes ', category: 'vegetables', quantity: 500, unit: 'g', line_total: 15_000 },
      { product_name: 'Cola', category: 'beverages', quantity: 3, unit: 'pcs', line_total: 30_000 },
    ], { created_at: '2026-07-11T08:00:00+05:00' }),
    purchase('three', '2026-07-12', 'terminal', 'Eco', [
      { product_name: 'Milk', category: 'dairy', quantity: 500, unit: 'ml', line_total: 12_000 },
    ], { market_name: 'Eco market', created_at: '2026-07-12T08:00:00+05:00' }),
  ]

  const summary = summarizeBazaarPurchases(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-12' })

  assert.equal(summary.totalSpent, 157_000)
  assert.equal(summary.purchaseCount, 3)
  assert.equal(summary.totalItemLines, 5)
  assert.equal(summary.uniqueProducts, 4)
  assert.equal(summary.activeDays, 3)
  assert.equal(summary.averagePerDay, 157_000 / 3)
  assert.deepEqual(summary.daily.map(row => [row.date, row.total]), [
    ['2026-07-10', 100_000],
    ['2026-07-11', 45_000],
    ['2026-07-12', 12_000],
  ])
  assert.deepEqual(summary.payments.map(row => [row.key, row.amount]), [
    ['cash', 100_000],
    ['card', 45_000],
    ['terminal', 12_000],
  ])
  assert.deepEqual(summary.buyers.map(row => [row.name, row.amount, row.purchases]), [['Ali', 157_000, 3]])

  const tomatoes = summary.products.find(product => product.product_key === 'tomatoes')
  assert.equal(tomatoes.unit, 'kg')
  assert.equal(tomatoes.quantity, 2.5)
  assert.equal(tomatoes.spend, 55_000)
  assert.equal(tomatoes.averageUnitCost, 22_000)
  assert.equal(tomatoes.latestUnitCost, 30_000)
  assert.equal(tomatoes.previousUnitCost, 20_000)
  assert.equal(tomatoes.unitCostChangePct, 50)

  const milk = summary.products.find(product => product.product_key === 'milk')
  assert.equal(milk.unit, 'l')
  assert.equal(milk.quantity, 0.5)
  assert.equal(getBazaarUnitCost(rows[2].bazaar_purchase_items[0]), 24_000)
})

test('unit prices normalize weight to kilograms and preserve item units', () => {
  assert.equal(getBazaarUnitCost({ quantity: 4, unit: 'kg', line_total: 60_000 }), 15_000)
  assert.equal(getBazaarUnitCost({ quantity: 500, unit: 'g', line_total: 30_000 }), 60_000)
  assert.equal(getBazaarUnitCost({ quantity: 1, unit: 'pcs', line_total: 70_000 }), 70_000)
})

test('product price changes compare aggregate unit costs across distinct purchases', () => {
  const rows = [
    purchase('older', '2026-07-10', 'cash', 'Mavtuna', [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: 1, unit: 'kg', line_total: 20_000 },
    ], { created_at: '2026-07-10T08:00:00+05:00' }),
    purchase('latest', '2026-07-11', 'cash', 'Mavtuna', [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: 1, unit: 'kg', line_total: 30_000 },
      { product_name: ' tomatoes ', category: 'vegetables', quantity: 1000, unit: 'g', line_total: 20_000 },
    ], { created_at: '2026-07-11T08:00:00+05:00' }),
  ]

  const summary = summarizeBazaarPurchases(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-11' })
  const tomatoes = summary.products.find(product => product.product_key === 'tomatoes')

  assert.equal(tomatoes.purchaseCount, 2)
  assert.equal(tomatoes.lines, 3)
  assert.equal(tomatoes.quantity, 3)
  assert.equal(tomatoes.spend, 70_000)
  assert.equal(tomatoes.latestUnitCost, 25_000)
  assert.equal(tomatoes.previousUnitCost, 20_000)
  assert.equal(tomatoes.unitCostChangePct, 25)
})

test('historical unitemized spend reconciles totals without pretending to be a product', () => {
  const rows = [purchase('legacy', '2026-07-10', 'terminal', '', [], {
    entry_source: 'accounting_backfill',
    total_amount: 500_000,
  })]

  const summary = summarizeBazaarPurchases(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-10' })

  assert.equal(summary.totalSpent, 500_000)
  assert.equal(summary.purchaseCount, 1)
  assert.equal(summary.totalItemLines, 0)
  assert.equal(summary.uniqueProducts, 0)
  assert.deepEqual(summary.products, [])
  assert.deepEqual(summary.categories, [])
  assert.deepEqual(summary.payments.map(row => [row.key, row.amount]), [['terminal', 500_000]])
})

test('buyer analytics retain one identity when a linked employee name changes', () => {
  const buyerId = '00000000-0000-0000-0000-000000000001'
  const rows = [
    purchase('old-name', '2026-07-10', 'cash', '', [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: 1, unit: 'kg', line_total: 20_000 },
    ], { buyer_profile_id: buyerId, buyer_name: 'Ali Old' }),
    purchase('new-name', '2026-07-11', 'cash', '', [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: 1, unit: 'kg', line_total: 25_000 },
    ], { buyer_profile_id: buyerId, buyer_name: 'Ali New' }),
  ]

  const summary = summarizeBazaarPurchases(rows, { dateFrom: '2026-07-10', dateTo: '2026-07-11' })
  assert.deepEqual(summary.buyers.map(row => [row.profile_id, row.name, row.amount, row.purchases]), [
    [buyerId, 'Ali New', 45_000, 2],
  ])
})

test('category analytics allocate only matching product lines, not the whole mixed receipt', () => {
  const rows = [
    purchase('mixed', '2026-07-10', 'cash', 'Mavtuna', [
      { product_name: 'Tomatoes', category: 'vegetables', quantity: 2, unit: 'kg', line_total: 40_000 },
      { product_name: 'Oil', category: 'grocery', quantity: 2, unit: 'l', line_total: 60_000 },
    ]),
  ]

  const vegetables = summarizeBazaarPurchases(rows, {
    dateFrom: '2026-07-10',
    dateTo: '2026-07-10',
    category: 'vegetables',
  })

  assert.equal(vegetables.totalSpent, 40_000)
  assert.equal(vegetables.purchaseCount, 1)
  assert.deepEqual(vegetables.categories.map(row => [row.key, row.amount]), [['vegetables', 40_000]])
  assert.deepEqual(vegetables.payments.map(row => [row.key, row.amount]), [['cash', 40_000]])

  assert.equal(getBazaarPurchaseScopedTotal(rows[0], 'vegetables'), 40_000)
  assert.deepEqual(getBazaarPurchaseScopedItems(rows[0], 'vegetables').map(item => item.product_name), ['Tomatoes'])
  assert.equal(getBazaarPurchaseScopedTotal(rows[0], 'all'), 100_000)
})

test('create submission retries retain a request key only while the payload is unchanged', () => {
  let sequence = 0
  const createRequestKey = () => `request-${++sequence}`
  const payload = { purchase_date: '2026-07-17', items: [{ product_name: 'Tomatoes' }] }

  const first = getBazaarSubmissionAttempt(null, payload, createRequestKey)
  const retry = getBazaarSubmissionAttempt(first, { ...payload }, createRequestKey)
  const changed = getBazaarSubmissionAttempt(first, { ...payload, supplier: 'Mavtuna' }, createRequestKey)

  assert.equal(first.requestKey, 'request-1')
  assert.equal(retry, first)
  assert.equal(changed.requestKey, 'request-2')
})
