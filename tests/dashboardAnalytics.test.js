import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatReadableDateTime,
  getDashboardBestSelling,
  getDashboardPaymentMethods,
  getDashboardPeriodOrders,
  getDashboardSalesByCategory,
  getDashboardStaffPerformance,
} from '../src/lib/dashboardAnalytics.js'
import {
  getOrderActivityDate,
  groupOrdersBySession,
  toRestaurantDateStr,
} from '../src/lib/analytics.js'

const menuItemMap = {
  kebab: { id: 'kebab', category_id: 'kebab', image_url: 'kebab.jpg' },
  cola: { id: 'cola', category_id: 'drinks', image_url: 'cola.jpg' },
  lagman: { id: 'lagman', category_id: 'first', image_url: 'lagman.jpg' },
  salad: { id: 'salad', category_id: 'salads', image_url: 'salad.jpg' },
}

const categoryMap = {
  kebab: { id: 'kebab', name_en: 'Kebab' },
  drinks: { id: 'drinks', name_en: 'Drinks' },
  first: { id: 'first', name_en: 'First Meal' },
  salads: { id: 'salads', name_en: 'Salads' },
}

function order({ id, paidAt, method = 'cash', items, total, waiter = 'Jasurbek' }) {
  return {
    id,
    payment_status: 'paid',
    paid_at: paidAt,
    payment_method: method,
    waiter_name: waiter,
    total,
    service_rate_pct: 0,
    items,
  }
}

function item(menu_item_id, name, quantity, price) {
  return { menu_item_id, name, quantity, price }
}

const now = new Date('2026-05-19T23:29:00')

const orders = [
  order({
    id: 'today',
    paidAt: '2026-05-19T10:00:00',
    method: 'cash',
    items: [item('kebab', 'Kebab', 2, 25000), item('cola', 'Cola', 1, 12000)],
    total: 62000,
  }),
  order({
    id: 'week',
    paidAt: '2026-05-15T10:00:00',
    method: 'card',
    waiter: 'Dildora',
    items: [item('lagman', 'Lagman', 3, 32000)],
    total: 96000,
  }),
  order({
    id: 'month',
    paidAt: '2026-05-02T10:00:00',
    method: 'qr',
    waiter: 'Dildora',
    items: [item('salad', 'Salad', 4, 15000)],
    total: 60000,
  }),
  order({
    id: 'year',
    paidAt: '2026-01-12T10:00:00',
    method: 'terminal',
    waiter: 'Aziz',
    items: [item('cola', 'Cola', 5, 12000)],
    total: 60000,
  }),
  order({
    id: 'previous-year',
    paidAt: '2025-12-31T10:00:00',
    method: 'cash',
    waiter: 'Aziz',
    items: [item('kebab', 'Old Kebab', 9, 25000)],
    total: 225000,
  }),
]

function analyticsFor(period) {
  const periodOrders = getDashboardPeriodOrders(orders, period, now)
  return {
    ids: periodOrders.map(row => row.id),
    revenue: periodOrders.reduce((sum, row) => sum + row.total, 0),
    payments: getDashboardPaymentMethods(periodOrders),
    categories: getDashboardSalesByCategory(periodOrders, menuItemMap, categoryMap, 'en'),
    best: getDashboardBestSelling(periodOrders, menuItemMap),
    staff: getDashboardStaffPerformance(periodOrders, [
      { full_name: 'Jasurbek', role: 'waiter' },
      { full_name: 'Dildora', role: 'waiter' },
      { full_name: 'Aziz', role: 'admin' },
    ]),
  }
}

test('dashboard selected period filters revenue payments categories and best sellers together for today', () => {
  const data = analyticsFor('today')

  assert.deepEqual(data.ids, ['today'])
  assert.equal(data.revenue, 62000)
  assert.deepEqual(data.payments.map(row => row.key), ['cash'])
  assert.deepEqual(data.categories.map(row => row.name), ['Kebab', 'Drinks'])
  assert.deepEqual(data.best.map(row => row.menuItemId), ['kebab', 'cola'])
  assert.deepEqual(data.staff.map(row => row.name), ['Jasurbek'])
})

test('dashboard today period uses restaurant timezone instead of device timezone', () => {
  const edgeOrders = [
    order({
      id: 'restaurant-today',
      paidAt: '2026-05-19T19:30:00.000Z',
      items: [item('kebab', 'Kebab', 1, 25000)],
      total: 25000,
    }),
    order({
      id: 'restaurant-yesterday',
      paidAt: '2026-05-18T18:30:00.000Z',
      items: [item('cola', 'Cola', 1, 12000)],
      total: 12000,
    }),
  ]

  assert.equal(toRestaurantDateStr('2026-05-19T19:30:00.000Z'), '2026-05-20')
  assert.deepEqual(
    getDashboardPeriodOrders(edgeOrders, 'today', new Date('2026-05-19T20:00:00.000Z')).map(row => row.id),
    ['restaurant-today']
  )
})

test('dashboard period change from today to 7 days removes stale today-only category and dish data', () => {
  const today = analyticsFor('today')
  const week = analyticsFor('7days')

  assert.deepEqual(today.categories.map(row => row.name), ['Kebab', 'Drinks'])
  assert.deepEqual(week.ids, ['today', 'week'])
  assert.deepEqual(week.categories.map(row => row.name), ['First Meal', 'Kebab', 'Drinks'])
  assert.deepEqual(week.best.map(row => row.menuItemId), ['lagman', 'kebab', 'cola'])
  assert.deepEqual(week.staff.map(row => row.name), ['Dildora', 'Jasurbek'])
})

test('dashboard period change from 7 days to month updates all widgets to month data', () => {
  const month = analyticsFor('month')

  assert.deepEqual(month.ids, ['today', 'week', 'month'])
  assert.equal(month.revenue, 218000)
  assert.deepEqual(month.payments.map(row => row.key), ['card', 'cash', 'qr'])
  assert.deepEqual(month.categories.map(row => row.name), ['First Meal', 'Salads', 'Kebab', 'Drinks'])
  assert.deepEqual(month.best.map(row => row.menuItemId), ['salad', 'lagman', 'kebab', 'cola'])
  assert.deepEqual(month.staff.map(row => row.name), ['Dildora', 'Jasurbek'])
  assert.deepEqual(month.staff.map(row => row.revenue), [156000, 62000])
})

test('dashboard period change from month to year updates all widgets to year data', () => {
  const year = analyticsFor('year')

  assert.deepEqual(year.ids, ['today', 'week', 'month', 'year'])
  assert.equal(year.revenue, 278000)
  assert.deepEqual(year.payments.map(row => row.key), ['card', 'cash', 'qr', 'terminal'])
  assert.deepEqual(year.categories.map(row => row.name), ['First Meal', 'Drinks', 'Salads', 'Kebab'])
  assert.deepEqual(year.best.map(row => row.menuItemId), ['cola', 'salad', 'lagman', 'kebab'])
  assert.deepEqual(year.staff.map(row => row.name), ['Dildora', 'Jasurbek', 'Aziz'])
})

test('dashboard empty selected period returns zero and empty widget states', () => {
  const empty = getDashboardPeriodOrders(orders, 'today', new Date('2026-05-18T12:00:00'))
  const payments = getDashboardPaymentMethods(empty)
  const categories = getDashboardSalesByCategory(empty, menuItemMap, categoryMap, 'en')
  const best = getDashboardBestSelling(empty, menuItemMap)
  const staff = getDashboardStaffPerformance(empty)

  assert.equal(empty.reduce((sum, row) => sum + row.total, 0), 0)
  assert.deepEqual(payments, [])
  assert.deepEqual(categories, [])
  assert.deepEqual(best, [])
  assert.deepEqual(staff, [])
})

test('latest selected period wins when a slow analytics response resolves out of order', async () => {
  let selectedPeriod = 'today'
  let rendered = null

  function request(period, delay) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ period, data: analyticsFor(period) })
      }, delay)
    }).then(result => {
      if (result.period === selectedPeriod) {
        rendered = result
      }
    })
  }

  const slowToday = request('today', 20)
  selectedPeriod = '7days'
  const fastWeek = request('7days', 1)

  await Promise.all([slowToday, fastWeek])

  assert.equal(rendered.period, '7days')
  assert.deepEqual(rendered.data.ids, ['today', 'week'])
})

test('dashboard readable date format uses a clear date time separator', () => {
  assert.equal(
    formatReadableDateTime('2026-05-19T23:29:00'),
    '19.05.2026 23:29'
  )
})

test('recent order activity uses bill request time instead of stale open time', () => {
  const order = {
    id: 'o-needs-bill',
    table_id: 't6',
    status: 'needs_bill',
    payment_status: 'unpaid',
    created_at: '2026-06-22T07:00:00.000Z',
    updated_at: '2026-06-29T07:59:00.000Z',
  }
  const tables = [{ id: 't6', status: 'needs_bill', updated_at: '2026-06-29T07:58:00.000Z' }]

  assert.equal(getOrderActivityDate(order, tables), '2026-06-29T07:59:00.000Z')
})

test('recent order activity falls back to table bill time when legacy order update is missing', () => {
  const order = {
    id: 'o-legacy-needs-bill',
    table_id: 't6',
    status: 'needs_bill',
    payment_status: 'unpaid',
    created_at: '2026-06-22T07:00:00.000Z',
  }
  const tables = [{ id: 't6', status: 'needs_bill', updated_at: '2026-06-29T07:58:00.000Z' }]

  assert.equal(getOrderActivityDate(order, tables), '2026-06-29T07:58:00.000Z')
})

test('merged recent order sessions keep the newest status update time', () => {
  const [session] = groupOrdersBySession([
    {
      id: 'o-old-round',
      table_id: 't6',
      status: 'needs_bill',
      payment_status: 'unpaid',
      created_at: '2026-06-22T07:00:00.000Z',
      updated_at: '2026-06-29T07:50:00.000Z',
      total: 10000,
      items: [],
    },
    {
      id: 'o-new-round',
      table_id: 't6',
      status: 'needs_bill',
      payment_status: 'unpaid',
      created_at: '2026-06-22T08:00:00.000Z',
      updated_at: '2026-06-29T07:59:00.000Z',
      total: 15000,
      items: [],
    },
  ])

  assert.equal(session.updated_at, '2026-06-29T07:59:00.000Z')
})
