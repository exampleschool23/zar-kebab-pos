import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCompletedOrderGroupMessage,
  buildCustomerStatusMessage,
  getCompletedOrdersChatIds,
  mergeCompletedOrders,
  shouldNotifyCompletedOrderGroup,
} from '../api/telegram/_lib/orderStatusMessages.js'

test('completed table rounds merge into one Telegram order summary', () => {
  const order = mergeCompletedOrders([
    {
      id: 'drinks', table_name: 'Table 3', waiter_name: 'Ali', price_mode: 'tourist',
      subtotal: 20000, service_fee: 3000, service_rate_pct: 15, total: 23000, payment_method: 'cash',
      items: [{ name: 'Tea', quantity: 2, unit_price: 10000, status: 'served' }],
      payments: [{ method: 'cash', amount: 23000 }], paid_at: '2026-07-12T13:00:00Z',
    },
    {
      id: 'meal', table_name: 'Table 3', waiter_name: 'Bek', price_mode: 'tourist',
      subtotal: 70000, service_fee: 10500, service_rate_pct: 15, total: 80500, payment_method: 'cash',
      items: [{ name: 'Kebab', quantity: 2, unit_price: 35000, status: 'served' }],
      payments: [{ method: 'cash', amount: 80500 }], paid_at: '2026-07-12T13:00:00Z',
    },
  ])

  assert.equal(order.subtotal, 90000)
  assert.equal(order.service_fee, 13500)
  assert.equal(order.total, 103500)
  assert.equal(order.items.length, 2)
  assert.equal(order.waiter_name, 'Ali, Bek')
  assert.deepEqual(order.payments, [{ method: 'cash', amount: 103500 }])

  const message = buildCompletedOrderGroupMessage({ ...order, dailyRevenueTotal: 500000 })
  assert.match(message, /Tea/)
  assert.match(message, /Kebab/)
  assert.match(message, /Сумма заказа: 90 000 UZS/)
  assert.match(message, /Сервис 15%: 13 500 UZS/)
  assert.match(message, /Оплата: Наличные 103 500 UZS/)
  assert.equal((message.match(/Стол: Table 3/g) || []).length, 1)
})

test('completed order group chat ids parse comma-separated env values', () => {
  assert.deepEqual(
    getCompletedOrdersChatIds({
      TELEGRAM_COMPLETED_ORDERS_CHAT_ID: ' -100123 , -100456, -100123 ',
    }),
    ['-100123', '-100456']
  )
})

test('completed order group notification requires paid order and configured chat id', () => {
  const env = { TELEGRAM_COMPLETED_ORDERS_CHAT_ID: '-100123' }

  assert.equal(
    shouldNotifyCompletedOrderGroup('completed', { payment_status: 'paid', status: 'paid' }, env),
    true
  )
  assert.equal(
    shouldNotifyCompletedOrderGroup('completed', { payment_status: 'unpaid', status: 'delivered' }, env),
    false
  )
  assert.equal(
    shouldNotifyCompletedOrderGroup('served', { payment_status: 'paid', status: 'paid' }, env),
    false
  )
  assert.equal(
    shouldNotifyCompletedOrderGroup('completed', { payment_status: 'paid', status: 'paid' }, {}),
    false
  )
})

test('completed order group message escapes dynamic Telegram HTML fields', () => {
  const message = buildCompletedOrderGroupMessage({
    id: 'order<1>',
    order_number: 'A&B<2>',
    table_name: 'Table <1>',
    waiter_name: 'Jasurbek & Team',
    order_type: 'take_away',
    price_mode: 'tourist',
    subtotal: 142000,
    service_fee: 21300,
    service_rate_pct: 15,
    total: 163300,
    dailyRevenueTotal: 525300,
    payment_method: 'terminal',
    completed_by_name: 'Ali & Bob',
    paid_at: '2026-07-08T19:09:00.000Z',
    items: [
      { name: 'Beef <Shashlik>', menu_name_ru: 'Шашлык <говяжий>', quantity: 1, price: 30000, status: 'served' },
      { name: 'Cancelled item', quantity: 1, price: 99999, status: 'cancelled' },
    ],
  })

  assert.doesNotMatch(message, /Заказ закрыт/)
  assert.doesNotMatch(message, /Заказ: A&amp;B&lt;2&gt;/)
  assert.equal(message.startsWith('Тип: Заказ с собой'), true)
  assert.doesNotMatch(message, /Стол: Table &lt;1&gt;/)
  assert.match(message, /Официант: Jasurbek &amp; Team/)
  assert.match(message, /Закрыл: Ali &amp; Bob/)
  assert.match(message, /Дата: 09\.07\.2026, 00:09/)
  assert.match(message, /Тип меню: 🧳 Турист/)
  assert.doesNotMatch(message, /Итого: 163 300 UZS/)
  assert.equal((message.match(/Тип: Заказ с собой/g) || []).length, 1)
  assert.match(message, /Шашлык &lt;говяжий&gt;/)
  assert.doesNotMatch(message, /Beef &lt;Shashlik&gt;/)
  assert.doesNotMatch(message, /Cancelled item/)
  assert.match(message, /Сумма заказа: 142 000 UZS/)
  assert.match(message, /Сервис 15%: 21 300 UZS/)
  assert.match(message, /Оплата: Терминал/)
  assert.doesNotMatch(message, /К оплате: 163 300 UZS/)
  assert.match(message, /Доход · Сегодня: 525 300 UZS/)
})

test('completed dine-in group message starts with table and hides separate type line', () => {
  const message = buildCompletedOrderGroupMessage({
    table_name: 'Terassa stol 1',
    waiter_name: 'Jasurbek',
    completed_by_name: 'Ali',
    order_type: 'dine_in',
    price_mode: 'regular',
    total: 163300,
    payment_status: 'paid',
    paid_at: '2026-07-08T19:09:00.000Z',
    items: [],
  })

  assert.equal(message.startsWith('Стол: Terassa stol 1'), true)
  assert.doesNotMatch(message, /Тип: В зале/)
  assert.match(message, /Тип меню: Обычное/)
})

test('completed group message shows split payment methods with amounts', () => {
  const message = buildCompletedOrderGroupMessage({
    table_name: 'Terassa stol 1',
    waiter_name: 'Jasurbek',
    completed_by_name: 'Ali',
    order_type: 'dine_in',
    subtotal: 100000,
    service_fee: 0,
    total: 100000,
    payment_status: 'paid',
    paid_at: '2026-07-08T19:09:00.000Z',
    payments: [
      { method: 'cash', amount: 60000 },
      { method: 'card', amount: 40000 },
    ],
  })

  assert.match(message, /Оплата: Наличные 60 000 UZS, Карта 40 000 UZS/)
})

test('customer status message escapes order labels', () => {
  const message = buildCustomerStatusMessage('completed', { order_number: 'TG<&1>' })
  assert.match(message, /Order completed\nOrder TG&lt;&amp;1&gt;/)
})
