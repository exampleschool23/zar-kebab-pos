import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKitchenCheckHtml,
  getKitchenCheckGroups,
} from '../src/lib/kitchenCheck.js'

const item = (overrides = {}) => ({
  id: overrides.id || 'i1',
  menu_item_id: overrides.menu_item_id || 'm1',
  name: overrides.name || 'Chicken Shashlik',
  quantity: overrides.quantity ?? 1,
  status: overrides.status || 'new',
  notes: overrides.notes || '',
  ...overrides,
})

test('cook checks stay split by submitted order round', () => {
  const groups = getKitchenCheckGroups({
    id: 'same-order',
    table_name: 'Table 3',
    waiter_name: 'Waiter',
    items: [
      item({ id: 'a', order_id: 'same-order', submitted_at: '2026-06-10T10:00:00.000Z', name: 'Chicken', quantity: 2 }),
      item({ id: 'b', order_id: 'same-order', submitted_at: '2026-06-10T10:05:00.000Z', name: 'Bread', quantity: 1 }),
      item({ id: 'c', order_id: 'same-order', submitted_at: '2026-06-10T10:00:00.000Z', name: 'Tea', quantity: 3 }),
    ],
  })

  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map(group => group.roundId), ['2026-06-10T10:00:00.000Z', '2026-06-10T10:05:00.000Z'])
  assert.deepEqual(groups.map(group => group.orderId), ['same-order', 'same-order'])
  assert.deepEqual(groups[0].items.map(row => row.name), ['Chicken', 'Tea'])
  assert.deepEqual(groups[1].items.map(row => row.name), ['Bread'])
})

test('cook checks fall back to persisted item created_at after reload', () => {
  const groups = getKitchenCheckGroups({
    id: 'same-order',
    items: [
      item({ id: 'a', order_id: 'same-order', created_at: '2026-06-10T11:00:00.000Z', name: 'First round' }),
      item({ id: 'b', order_id: 'same-order', created_at: '2026-06-10T11:08:00.000Z', name: 'Second round' }),
    ],
  })

  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map(group => group.items[0].name), ['First round', 'Second round'])
})

test('cook checks exclude cancelled unavailable items', () => {
  const groups = getKitchenCheckGroups({
    id: 'order-1',
    items: [
      item({ id: 'a', order_id: 'order-1', name: 'Available item' }),
      item({ id: 'b', order_id: 'order-1', name: 'Unavailable item', status: 'cancelled' }),
    ],
  })

  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].items.map(row => row.name), ['Available item'])
})

test('cook check print html contains item notes but no prices', () => {
  const [group] = getKitchenCheckGroups({
    id: 'order-1',
    table_name: 'Table 3',
    waiter_name: 'Jasurbek',
    order_number: 'TA-100',
    created_at: '2026-06-10T10:00:00.000Z',
    items: [
      item({ id: 'a', order_id: 'order-1', name: 'Minced Meat Shashlik', quantity: 2, notes: 'No onion', price: 18000 }),
    ],
  })
  const html = buildKitchenCheckHtml({ group, lang: 'en', restaurantName: 'Zar Kebab' })

  assert.match(html, /Cook Check/)
  assert.match(html, /Table 3/)
  assert.match(html, /Minced Meat Shashlik/)
  assert.match(html, /No onion/)
  assert.doesNotMatch(html, /18000/)
  assert.doesNotMatch(html, /UZS/)
})
