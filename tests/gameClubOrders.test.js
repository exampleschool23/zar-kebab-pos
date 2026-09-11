import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inferOrderType, normalizeOrderType, orderTypePrefix, orderTypeLabel } from '../src/lib/orderTypes.js'
import { ordersReducer } from '../src/store/ordersReducer.js'
import { getOrderPaymentSummary, getOrderRevenueTotal } from '../src/lib/analytics.js'
import { isCashierVisibleBill, isTakeAwayBill, isDeliveryBill } from '../src/lib/cashierBills.js'
import { getDashboardOrderTypePerformance } from '../src/lib/dashboardAnalytics.js'
import { getGameClubRevenue } from '../src/lib/gameClubRevenue.js'
import { getDailyPayrollGroupSummary, buildDailyPayrollGroupMessage } from '../api/telegram/_lib/salaryMessages.js'
import { buildDailyPayrollGroupReportSvg } from '../api/telegram/_lib/payrollReportImage.js'
import { buildCompletedOrderGroupMessage } from '../api/telegram/_lib/orderStatusMessages.js'

const item = { id: 'item-1', menu_item_id: 'm1', name: 'Kebab', quantity: 2, price: 50000, status: 'new' }
const paidOrder = (type, total, extra = {}) => ({ id: type, order_type: type, total, payment_status: 'paid', status: 'paid', items: [item], ...extra })

test('Game Club classification is distinct and old order types retain their identities', () => {
  for (const value of ['game_club', 'Game Club', 'Game Club deliveries', 'Игровой клуб']) assert.equal(normalizeOrderType(value), 'game_club')
  assert.equal(inferOrderType({ table_name: 'Game Club' }), 'game_club')
  assert.equal(inferOrderType({ order_type: 'take_away', table_name: 'Game Club' }), 'take_away')
  assert.equal(normalizeOrderType('delivery'), 'delivery')
  assert.equal(normalizeOrderType('Take Away'), 'take_away')
  assert.equal(orderTypePrefix('game_club'), 'GC')
  assert.equal(orderTypeLabel('game_club', 'ru'), 'Игровой клуб')
})

test('Game Club kitchen to cashier to paid flow uses no table or service and isolates settlement', () => {
  const state = { settings: { serviceRate: 15 }, user: { id: 'u1', name: 'Waiter' }, currentTableId: null,
    tables: [{ id: 't1', status: 'available' }], orders: [paidOrder('take_away', 25000)], cart: [item] }
  const sent = ordersReducer(state, { type: 'SEND_TO_KITCHEN', _orderId: 'gc-1', _items: [item], payload: { orderType: 'game_club' } })
  const order = sent.orders.find(row => row.id === 'gc-1')
  assert.equal(order.order_type, 'game_club')
  assert.equal(order.table_id, null)
  assert.equal(order.table_name, 'Game Club')
  assert.match(order.order_number, /^GC-/)
  assert.equal(order.service_rate_pct, 0)
  assert.equal(order.total, 100000)
  assert.equal(isCashierVisibleBill(order), true)
  assert.equal(isTakeAwayBill(order), false)
  assert.equal(isDeliveryBill(order), false)
  assert.deepEqual(sent.tables, state.tables)
  const paid = ordersReducer(sent, { type: 'MARK_ORDER_PAID', payload: { orderId: order.id, payment_method: 'cash' } })
  const completed = paid.orders.find(row => row.id === order.id)
  assert.equal(completed.payment_status, 'paid')
  assert.equal(completed.order_type, 'game_club')
  assert.equal(getGameClubRevenue(paid.orders), 100000)
  assert.equal(isCashierVisibleBill(completed), false)
  assert.equal(paid.orders.find(row => row.id === 'take_away').total, 25000)
})

test('Game Club service is zero in both price modes; paid totals are immutable', () => {
  for (const price_mode of ['regular', 'tourist']) {
    assert.equal(getOrderPaymentSummary({ order_type: 'game_club', price_mode, service_rate_pct: 30 }, [item], 30).serviceFee, 0)
  }
  assert.equal(getOrderRevenueTotal(paidOrder('game_club', 87000)), 87000)
})

test('revenue reporting separates Game Club and excludes unpaid or cancelled orders', () => {
  const orders = [paidOrder('dine_in', 10000), paidOrder('take_away', 20000), paidOrder('delivery', 30000),
    paidOrder('game_club', 15000), paidOrder('game_club', 25000, { price_mode: 'tourist' })]
  const rows = getDashboardOrderTypePerformance(orders)
  assert.equal(rows.find(row => row.key === 'game_club').revenue, 40000)
  assert.equal(rows.find(row => row.key === 'game_club').pct, 40)
  assert.equal(rows.reduce((sum, row) => sum + row.revenue, 0), 100000)
  assert.equal(getGameClubRevenue([...orders, paidOrder('game_club', 90000, { status: 'cancelled' }),
    paidOrder('game_club', 90000, { status: 'new', payment_status: 'unpaid' })]), 40000)
  assert.equal(getGameClubRevenue([]), 0)
})

test('Telegram text and financial image report Game Club revenue and a separate chart segment', () => {
  const summary = getDailyPayrollGroupSummary([], [], '2026-09-06', {
    cafeIncome: 100000, regularDineInIncome: 10000, regularOffPremiseIncome: 20000, touristIncome: 30000, gameClubIncome: 40000,
  })
  assert.equal(summary.gameClubIncomeTotal, 40000)
  assert.equal(summary.gameClubPercentage, 40)
  assert.equal(summary.touristPercentage, 30)
  assert.equal(summary.dineInPercentage + summary.offPremisePercentage + summary.touristPercentage + summary.gameClubPercentage, 100)
  assert.match(buildDailyPayrollGroupMessage(summary, '2026-09-06', 'ru'), /Игровой клуб.*40.?000.*40/)
  assert.match(buildDailyPayrollGroupReportSvg(summary, '2026-09-06'), /ИГРОВОЙ КЛУБ/)
  assert.match(buildCompletedOrderGroupMessage(paidOrder('game_club', 40000)), /Игровой клуб/)
})

test('Game Club migration expands storage, permission checks and settlement without rewriting history', () => {
  const sql = readFileSync(new URL('../supabase/179_game_club_orders.sql', import.meta.url), 'utf8')
  assert.match(sql, /orders add constraint orders_order_type_check/)
  assert.match(sql, /order_items add constraint order_items_order_type_check/)
  for (const signature of ['submit_order_to_kitchen(jsonb)', 'settle_orders_payment_strict(jsonb)']) assert.ok(sql.includes(signature))
  assert.match(sql, /raise exception 'Unexpected off-premise contract/)
  assert.doesNotMatch(sql, /update public\.(orders|order_items)/i)
})

test('Game Club migration does not depend on the reopening function retired by migration 090', () => {
  const retirement = readFileSync(new URL('../supabase/090_owner_change_completed_order_payment_method.sql', import.meta.url), 'utf8')
  const sql = readFileSync(new URL('../supabase/179_game_club_orders.sql', import.meta.url), 'utf8')
  assert.match(retirement, /drop function if exists public\.reopen_paid_orders_owner\(text\[\]\)/)
  const targets = [...sql.matchAll(/'public\.([a-z_]+\([^']*\))'/g)].map(match => match[1])
  assert.deepEqual(targets, ['submit_order_to_kitchen(jsonb)', 'settle_orders_payment_strict(jsonb)'])
  assert.doesNotMatch(sql, /reopen_paid_orders_owner/)
  assert.match(sql, /if to_regprocedure\(signature\) is null then\s+raise exception 'Required function/)
})

test('daily Telegram loader classifies both Game Club price modes once and retains accounting/payment totals', async () => {
  const { loadDailyPayrollGroupSummary } = await import('../api/telegram/daily-salary.js')
  const orders = [paidOrder('dine_in', 10000), paidOrder('take_away', 20000), paidOrder('delivery', 30000),
    paidOrder('game_club', 15000), paidOrder('game_club', 25000, { price_mode: 'tourist' }),
    paidOrder('dine_in', 50000, { price_mode: 'tourist' })].map(order => ({ ...order, payments: [{ method: 'cash', amount: order.total }] }))
  const queries = []
  const supabase = { from(table) {
    const query = { table, filters: [] }
    queries.push(query)
    const data = table === 'orders' ? orders : table === 'business_settings' ? {} : table === 'employee_daily_meal_expenses'
      ? { average_daily_amount: 0, present_employee_count: 0 } : []
    const builder = {
      select(columns) { query.columns = columns; return this },
      order(...args) { query.order = args; return this },
      range(from, to) { query.range = [from, to]; return this },
      eq(...args) { query.filters.push(['eq', ...args]); return this },
      neq(...args) { query.filters.push(['neq', ...args]); return this },
      in(...args) { query.filters.push(['in', ...args]); return this },
      gte(...args) { query.filters.push(['gte', ...args]); return this },
      lt(...args) { query.filters.push(['lt', ...args]); return this },
      maybeSingle() { return this },
      then(resolve) {
        const page = query.range && Array.isArray(data) ? data.slice(query.range[0], query.range[1] + 1) : data
        return Promise.resolve({ data: page, error: null }).then(resolve)
      },
    }
    return builder
  } }
  const summary = await loadDailyPayrollGroupSummary(supabase, '2026-09-06', [])
  assert.equal(summary.cafeIncomeTotal, 150000)
  assert.equal(summary.cashIncomeTotal, 150000)
  assert.equal(summary.gameClubIncomeTotal, 40000)
  assert.equal(summary.touristIncomeTotal, 50000)
  assert.equal(summary.dineInIncomeTotal, 10000)
  assert.equal(summary.offPremiseIncomeTotal, 50000)
  assert.equal(summary.estimatedTaxTotal, 6000)
  const dailyQuery = queries.find(query => query.table === 'orders')
  assert.ok(dailyQuery.columns.includes('order_type'))
  assert.deepEqual(dailyQuery.filters, [['eq', 'payment_status', 'paid'], ['gte', 'paid_at', '2026-09-06T00:00:00+05:00'], ['lt', 'paid_at', '2026-09-07T00:00:00+05:00']])
})
