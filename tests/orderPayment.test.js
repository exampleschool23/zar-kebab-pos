import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getGroupedOrderItems,
  getOrderTotal,
  getOrderPaymentSummary,
  groupOrdersBySession,
  isPaidOrder,
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

function item(overrides) {
  return {
    id: overrides.id || `item-${Math.random()}`,
    menu_item_id: overrides.menu_item_id,
    name: overrides.name || overrides.menu_item_id,
    quantity: overrides.quantity ?? 1,
    price: overrides.price ?? 0,
    status: overrides.status || 'new',
    ...overrides,
  }
}

function paidOrder(overrides) {
  const items = overrides.items || []
  const serviceRatePct = overrides.service_rate_pct ?? 17
  const summary = getOrderPaymentSummary({ service_rate_pct: serviceRatePct }, items, serviceRatePct)
  return {
    id: overrides.id,
    table_id: overrides.table_id,
    table_name: overrides.table_name,
    created_at: overrides.created_at || '2026-05-16T10:00:00.000Z',
    paid_at: overrides.paid_at || overrides.created_at || '2026-05-16T10:30:00.000Z',
    payment_status: overrides.payment_status || 'paid',
    status: overrides.status || 'paid',
    items,
    subtotal: overrides.subtotal ?? summary.subtotal,
    service_fee: overrides.service_fee ?? summary.serviceFee,
    service_rate_pct: serviceRatePct,
    total: overrides.total ?? summary.total,
    ...overrides,
  }
}

function activeOrder(overrides) {
  const items = overrides.items || []
  const serviceRatePct = overrides.service_rate_pct ?? 17
  const summary = getOrderPaymentSummary({ service_rate_pct: serviceRatePct }, items, serviceRatePct)
  return {
    id: overrides.id,
    table_id: overrides.table_id,
    table_name: overrides.table_name,
    created_at: overrides.created_at || '2026-05-16T10:00:00.000Z',
    payment_status: overrides.payment_status || 'unpaid',
    status: overrides.status || 'sent_to_kitchen',
    items,
    subtotal: overrides.subtotal ?? summary.subtotal,
    service_fee: overrides.service_fee ?? summary.serviceFee,
    service_rate_pct: serviceRatePct,
    total: overrides.total ?? summary.total,
    ...overrides,
  }
}

function paidRevenue(orders) {
  return orders.filter(isPaidOrder).reduce((sum, order) => sum + getOrderTotal(order), 0)
}

test('same table multiple order rounds include all additions and merge repeated plain items', () => {
  const rounds = [
    activeOrder({
      id: 'round-1',
      table_id: 'table-10',
      items: [
        item({ id: 'r1-a', menu_item_id: 'lula', name: 'Lula kebab', quantity: 1, price: 24000 }),
        item({ id: 'r1-b', menu_item_id: 'cola', name: 'Cola', quantity: 3, price: 12000 }),
      ],
    }),
    activeOrder({
      id: 'round-2',
      table_id: 'table-10',
      items: [item({ id: 'r2-a', menu_item_id: 'lagman', name: 'Lagman', quantity: 1, price: 32000 })],
    }),
    activeOrder({
      id: 'round-3',
      table_id: 'table-10',
      items: [item({ id: 'r3-a', menu_item_id: 'lula', name: 'Lula kebab', quantity: 2, price: 24000 })],
    }),
  ]
  const allItems = rounds.flatMap(order => order.items)
  const grouped = getGroupedOrderItems(allItems)
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, allItems, 17)

  assert.equal(grouped.find(row => row.menu_item_id === 'lula').quantity, 3)
  assert.equal(summary.subtotal, 140000)
  assert.equal(summary.total, 163800)
})

test('same table ordering the same item over three rounds totals quantity and amount correctly', () => {
  const allItems = [
    item({ id: 'r1', menu_item_id: 'lula', quantity: 1, price: 24000 }),
    item({ id: 'r2', menu_item_id: 'lula', quantity: 2, price: 24000 }),
    item({ id: 'r3', menu_item_id: 'lula', quantity: 1, price: 24000 }),
  ]
  const grouped = getGroupedOrderItems(allItems)
  const summary = getOrderPaymentSummary({ subtotal: 24000, service_rate_pct: 17 }, allItems, 17)

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].quantity, 4)
  assert.equal(summary.subtotal, 96000)
  assert.equal(summary.total, 112320)
})

test('same table different items over several rounds have one consistent subtotal for details receipt and reports', () => {
  const allItems = [
    item({ id: 'shashlik', menu_item_id: 'shashlik', quantity: 2, price: 25000 }),
    item({ id: 'cola', menu_item_id: 'cola', quantity: 3, price: 12000 }),
    item({ id: 'lagman', menu_item_id: 'lagman', quantity: 1, price: 32000 }),
  ]
  const order = paidOrder({ id: 'paid-mixed', table_id: 'table-10', items: allItems, service_rate_pct: 17, subtotal: 1 })
  const details = getOrderPaymentSummary(order, allItems, 17)
  const receipt = getOrderPaymentSummary(order, getGroupedOrderItems(allItems), 17)

  assert.equal(details.subtotal, 118000)
  assert.equal(receipt.total, details.total)
  assert.equal(getOrderTotal(order, 17), details.total)
})

test('dine-in and takeaway mixed flow keeps sections distinct and totals include both', () => {
  const allItems = [
    item({ id: 'd1', menu_item_id: 'lula', quantity: 1, price: 24000, order_type: 'dine_in' }),
    item({ id: 't1', menu_item_id: 'chiroqchi', quantity: 1, price: 17000, order_type: 'take_away' }),
    item({ id: 'd2', menu_item_id: 'lagman', quantity: 4, price: 32000, order_type: 'dine_in' }),
  ]
  const dineIn = allItems.filter(row => row.order_type === 'dine_in')
  const takeAway = allItems.filter(row => row.order_type === 'take_away')
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, allItems, 17)

  assert.equal(dineIn.length, 2)
  assert.equal(takeAway.length, 1)
  assert.equal(summary.subtotal, 169000)
  assert.equal(summary.total, 197730)
})

test('same table separate paid visits remain separate sessions and both count once in reports', () => {
  const orderA = paidOrder({
    id: 'order-a',
    table_id: 'table-10',
    paid_at: '2026-05-16T12:00:00.000Z',
    items: [item({ id: 'a1', menu_item_id: 'lula', quantity: 1, price: 24000 })],
  })
  const orderB = paidOrder({
    id: 'order-b',
    table_id: 'table-10',
    paid_at: '2026-05-16T15:30:00.000Z',
    items: [item({ id: 'b1', menu_item_id: 'lagman', quantity: 1, price: 32000 })],
  })
  const sessions = groupOrdersBySession([orderA, orderB])

  assert.equal(sessions.length, 2)
  assert.equal(paidRevenue(sessions), getOrderTotal(orderA) + getOrderTotal(orderB))
})

test('partial additions before payment include all final items without duplicating stale old items', () => {
  const firstSent = [item({ id: 'sent-1', menu_item_id: 'kebab', quantity: 2, price: 25000 })]
  const laterSent = [item({ id: 'sent-2', menu_item_id: 'cola', quantity: 2, price: 12000 })]
  const finalItems = [...firstSent, ...laterSent]
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, finalItems, 17)

  assert.equal(getGroupedOrderItems(finalItems).length, 2)
  assert.equal(summary.subtotal, 74000)
  assert.equal(summary.total, 86580)
})

test('takeaway-only paid order without a table calculates and reports revenue correctly', () => {
  const order = paidOrder({
    id: 'takeaway-only',
    table_id: null,
    table_name: 'Take Away',
    items: [item({ id: 't1', menu_item_id: 'shashlik', quantity: 2, price: 25000, order_type: 'take_away' })],
  })

  assert.equal(getOrderPaymentSummary(order, order.items, 17).subtotal, 50000)
  assert.equal(paidRevenue([order]), 58500)
})

test('dine-in-only order shows table context and calculates correct total', () => {
  const order = paidOrder({
    id: 'dine-only',
    table_id: 'table-10',
    table_name: 'Table 10',
    items: [item({ id: 'd1', menu_item_id: 'lagman', quantity: 2, price: 32000, order_type: 'dine_in' })],
  })

  assert.equal(order.table_name, 'Table 10')
  assert.equal(getOrderTotal(order), 74880)
})

test('same product with different order type is not merged when order type must remain visible', () => {
  const rows = [
    item({ id: 'd1', menu_item_id: 'lula', quantity: 1, price: 24000, order_type: 'dine_in' }),
    item({ id: 't1', menu_item_id: 'lula', quantity: 2, price: 24000, order_type: 'take_away' }),
  ]
  const grouped = getGroupedOrderItems(rows)
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, rows, 17)

  assert.equal(grouped.length, 2)
  assert.equal(summary.subtotal, 72000)
})

test('same product with different notes stays separate while identical notes merge', () => {
  const rows = [
    item({ id: 's1', menu_item_id: 'kebab', quantity: 1, price: 25000, notes: 'spicy' }),
    item({ id: 'n1', menu_item_id: 'kebab', quantity: 1, price: 25000, notes: 'no onion' }),
    item({ id: 's2', menu_item_id: 'kebab', quantity: 2, price: 25000, notes: 'spicy' }),
  ]
  const grouped = getGroupedOrderItems(rows)

  assert.equal(grouped.length, 2)
  assert.equal(grouped.find(row => row.notes === 'spicy').quantity, 3)
  assert.equal(grouped.find(row => row.notes === 'no onion').quantity, 1)
})

test('removed items before payment are excluded from final quantity subtotal and reports', () => {
  const finalItems = [item({ id: 'kebab-final', menu_item_id: 'kebab', quantity: 2, price: 25000 })]
  const order = paidOrder({ id: 'removed-before-pay', table_id: 'table-10', items: finalItems, service_rate_pct: 17 })

  assert.equal(getGroupedOrderItems(finalItems)[0].quantity, 2)
  assert.equal(getOrderPaymentSummary(order, finalItems, 17).subtotal, 50000)
  assert.equal(paidRevenue([order]), 58500)
})

test('cancelled order is excluded from paid revenue even if it has totals', () => {
  const cancelled = paidOrder({
    id: 'cancelled',
    table_id: 'table-10',
    status: 'cancelled',
    payment_status: 'cancelled',
    items: [item({ id: 'c1', menu_item_id: 'kebab', quantity: 3, price: 25000 })],
  })

  assert.equal(isPaidOrder(cancelled), false)
  assert.equal(paidRevenue([cancelled]), 0)
})

test('paid order revenue is stable across refresh and regrouping', () => {
  const order = paidOrder({
    id: 'stable-paid',
    table_id: 'table-10',
    paid_at: '2026-05-16T20:15:00.000Z',
    items: [item({ id: 'p1', menu_item_id: 'kebab', quantity: 2, price: 25000 })],
  })
  const refreshed = { ...order, items: [...order.items] }

  assert.equal(paidRevenue([order]), paidRevenue([refreshed]))
  assert.equal(paidRevenue(groupOrdersBySession([order])), getOrderTotal(order))
})

test('service fee is consistent across dine-in takeaway and mixed orders for 0 17 and 20 percent', () => {
  const flows = [
    [item({ id: 'd', menu_item_id: 'kebab', quantity: 2, price: 25000, order_type: 'dine_in' })],
    [item({ id: 't', menu_item_id: 'kebab', quantity: 2, price: 25000, order_type: 'take_away' })],
    [
      item({ id: 'm1', menu_item_id: 'kebab', quantity: 1, price: 25000, order_type: 'dine_in' }),
      item({ id: 'm2', menu_item_id: 'cola', quantity: 1, price: 12000, order_type: 'take_away' }),
    ],
  ]

  for (const rate of [0, 17, 20]) {
    for (const rows of flows) {
      const summary = getOrderPaymentSummary({ service_rate_pct: rate }, rows, 20)
      assert.equal(summary.serviceRatePct, rate)
      assert.equal(summary.serviceFee, Math.round(summary.subtotal * rate / 100))
      assert.equal(summary.total, summary.subtotal + summary.serviceFee)
    }
  }
})

test('real mixed regression scenario preserves dine-in takeaway items names and paid revenue once', () => {
  const rows = [
    item({ id: 'lula-en', menu_item_id: 'lula-en', name: 'Lula kebab', quantity: 1, price: 24000, order_type: 'dine_in' }),
    item({ id: 'cola', menu_item_id: 'cola', name: 'Кока-Кола 0.5L', quantity: 3, price: 12000, order_type: 'dine_in' }),
    item({ id: 'chiroqchi', menu_item_id: 'chiroqchi', name: 'Chiroqchi', quantity: 1, price: 17000, order_type: 'take_away' }),
    item({ id: 'lagman', menu_item_id: 'lagman', name: 'Лагман', quantity: 4, price: 32000, order_type: 'dine_in' }),
    item({ id: 'lula-ru', menu_item_id: 'lula-ru', name: 'Люля-кебаб', quantity: 3, price: 24000, order_type: 'dine_in' }),
  ]
  const order = paidOrder({
    id: 'table-10-regression',
    table_id: 'table-10',
    table_name: 'Table 10',
    items: rows,
    subtotal: 999999,
    service_rate_pct: 17,
  })
  const grouped = getGroupedOrderItems(rows)
  const summary = getOrderPaymentSummary(order, rows, 20)

  assert.equal(summary.subtotal, 277000)
  assert.equal(summary.serviceFee, 47090)
  assert.equal(summary.total, 324090)
  assert.equal(grouped.some(row => row.order_type === 'take_away'), true)
  assert.equal(grouped.find(row => row.menu_item_id === 'lula-en').quantity, 1)
  assert.equal(grouped.find(row => row.menu_item_id === 'lula-ru').quantity, 3)
  assert.equal(getOrderPaymentSummary(order, grouped, 20).total, summary.total)
  assert.equal(paidRevenue([order]), summary.total)
})
