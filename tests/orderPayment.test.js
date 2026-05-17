import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getGroupedOrderItems,
  getOrderPaymentSummary,
} from '../src/lib/analytics.js'

const screenshotItems = [
  { id: 'a', menu_item_id: 'lula-en', name: 'Lula kebab', quantity: 1, price: 24000 },
  { id: 'b', menu_item_id: 'cola', name: 'Кока-Кола 0.5L', quantity: 3, price: 12000 },
  { id: 'c', menu_item_id: 'lagman', name: 'Лагман', quantity: 4, price: 32000 },
  { id: 'd', menu_item_id: 'chicken', name: 'Shashlik tovuq', quantity: 1, price: 22000 },
  { id: 'e', menu_item_id: 'chiroqchi', name: 'Chiroqchi', quantity: 1, price: 17000 },
  { id: 'f', menu_item_id: 'lula-ru', name: 'Люля-кебаб', quantity: 3, price: 24000 },
  { id: 'g', menu_item_id: 'lentil', name: 'Чечевица', quantity: 4, price: 25000 },
]

test('order subtotal is calculated from item rows, not stale stored subtotal', () => {
  const summary = getOrderPaymentSummary(
    { subtotal: 465000, service_rate_pct: 17 },
    screenshotItems,
    20
  )

  assert.equal(summary.subtotal, 399000)
})

test('service fee uses saved/configured service_rate_pct', () => {
  const summary = getOrderPaymentSummary(
    { service_rate_pct: 17 },
    screenshotItems,
    20
  )

  assert.equal(summary.serviceRatePct, 17)
  assert.equal(summary.serviceFee, 67830)
})

test('receipt total equals order details total', () => {
  const order = { subtotal: 465000, total: 544800, service_rate_pct: 17 }

  const receiptSummary = getOrderPaymentSummary(order, screenshotItems, 20)
  const orderDetailsSummary = getOrderPaymentSummary(order, screenshotItems, 20)

  assert.equal(receiptSummary.total, 466830)
  assert.equal(receiptSummary.total, orderDetailsSummary.total)
})

test('items with different menu_item_id but similar localized names are not merged', () => {
  const items = [
    { id: '1', menu_item_id: 'lula-en', name: 'Lula kebab', quantity: 1, price: 24000 },
    { id: '2', menu_item_id: 'lula-ru', name: 'Люля-кебаб', quantity: 3, price: 24000 },
  ]

  const grouped = getGroupedOrderItems(items)

  assert.equal(grouped.length, 2)
  assert.deepEqual(grouped.map(item => item.quantity), [1, 3])
})

test('items with same menu_item_id but different modifiers/options are not merged', () => {
  const items = [
    { id: '1', menu_item_id: 'kebab', name: 'Kebab', quantity: 1, price: 24000, modifiers: [{ id: 'spicy' }] },
    { id: '2', menu_item_id: 'kebab', name: 'Kebab', quantity: 1, price: 24000, modifiers: [{ id: 'no-onion' }] },
  ]

  const grouped = getGroupedOrderItems(items)

  assert.equal(grouped.length, 2)
})

test('items with same menu_item_id and same modifiers/options are merged correctly', () => {
  const items = [
    { id: '1', menu_item_id: 'kebab', name: 'Kebab', quantity: 1, price: 24000, modifiers: [{ id: 'spicy' }] },
    { id: '2', menu_item_id: 'kebab', name: 'Kebab', quantity: 3, price: 24000, modifiers: [{ id: 'spicy' }] },
  ]

  const grouped = getGroupedOrderItems(items)

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].quantity, 4)
})
