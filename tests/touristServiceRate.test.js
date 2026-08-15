import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { getConfiguredServiceRatePct } from '../src/lib/serviceRates.js'
import { DEFAULT_SETTINGS } from '../src/store/reducerHelpers.js'
import { ordersReducer } from '../src/store/ordersReducer.js'

function state(overrides = {}) {
  return {
    settings: { serviceRate: 15, touristServiceRate: 20 },
    user: { id: 'waiter-1', name: 'Waiter' },
    currentTableId: 't1',
    tables: [{ id: 't1', name: 'Table 1', status: 'available' }],
    orders: [],
    cart: [],
    ...overrides,
  }
}

function menuRow(overrides = {}) {
  return {
    menu_item_id: 'meal-1',
    name: 'Meal',
    base_price: 100_000,
    unit_price: 100_000,
    price: 100_000,
    price_mode: 'regular',
    quantity: 1,
    ...overrides,
  }
}

test('service settings default to 15 percent Regular and 20 percent Tourist', () => {
  assert.equal(DEFAULT_SETTINGS.serviceRate, 15)
  assert.equal(DEFAULT_SETTINGS.touristServiceRate, 20)
  assert.equal(getConfiguredServiceRatePct({}, 'regular'), 15)
  assert.equal(getConfiguredServiceRatePct({}, 'tourist'), 20)
  assert.equal(getConfiguredServiceRatePct({ serviceRate: 12, touristServiceRate: 24 }, 'regular'), 12)
  assert.equal(getConfiguredServiceRatePct({ serviceRate: 12, touristServiceRate: 24 }, 'tourist'), 24)
})

test('new dine-in orders snapshot the service rate selected by price mode', () => {
  const regular = ordersReducer(state({ cart: [menuRow()] }), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'regular-order',
    payload: { orderType: 'dine_in', priceMode: 'regular' },
  })
  assert.equal(regular.orders[0].service_rate_pct, 15)
  assert.equal(regular.orders[0].service_fee, 15_000)
  assert.equal(regular.orders[0].total, 115_000)

  const tourist = ordersReducer(state({
    cart: [menuRow({ unit_price: 120_000, price: 120_000, price_mode: 'tourist' })],
  }), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'tourist-order',
    payload: { orderType: 'dine_in', priceMode: 'tourist' },
  })
  assert.equal(tourist.orders[0].service_rate_pct, 20)
  assert.equal(tourist.orders[0].service_fee, 24_000)
  assert.equal(tourist.orders[0].total, 144_000)
})

test('off-premise orders remain service-free even in Tourist price mode', () => {
  const next = ordersReducer(state({
    currentTableId: null,
    cart: [menuRow({ unit_price: 120_000, price: 120_000, price_mode: 'tourist' })],
  }), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'take-away-order',
    payload: { orderType: 'take_away', priceMode: 'tourist' },
  })

  assert.equal(next.orders[0].service_rate_pct, 0)
  assert.equal(next.orders[0].service_fee, 0)
  assert.equal(next.orders[0].total, 120_000)
})

test('active orders keep their saved rate after settings change', () => {
  const existingOrder = {
    id: 'tourist-order',
    table_id: 't1',
    table_name: 'Table 1',
    order_type: 'dine_in',
    price_mode: 'tourist',
    status: 'sent_to_kitchen',
    payment_status: 'unpaid',
    service_rate_pct: 20,
    subtotal: 120_000,
    service_fee: 24_000,
    total: 144_000,
    items: [menuRow({ id: 'old-item', unit_price: 120_000, price: 120_000, price_mode: 'tourist' })],
  }
  const next = ordersReducer(state({
    settings: { serviceRate: 15, touristServiceRate: 30 },
    tables: [{ id: 't1', name: 'Table 1', status: 'occupied' }],
    orders: [existingOrder],
    cart: [menuRow({ menu_item_id: 'meal-2', name: 'Second meal', unit_price: 60_000, price: 60_000, base_price: 50_000, price_mode: 'tourist' })],
  }), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'tourist-order',
    _items: [menuRow({ id: 'new-item', menu_item_id: 'meal-2', name: 'Second meal', unit_price: 60_000, price: 60_000, base_price: 50_000, price_mode: 'tourist' })],
    payload: { orderType: 'dine_in', priceMode: 'tourist' },
  })

  assert.equal(next.orders[0].service_rate_pct, 20)
  assert.equal(next.orders[0].subtotal, 180_000)
  assert.equal(next.orders[0].service_fee, 36_000)
})

test('a retained kitchen attempt uses its captured service-rate snapshot', () => {
  const next = ordersReducer(state({
    settings: { serviceRate: 15, touristServiceRate: 30 },
    cart: [menuRow({ unit_price: 120_000, price: 120_000, price_mode: 'tourist' })],
  }), {
    type: 'SEND_TO_KITCHEN',
    _orderId: 'retained-order',
    _serviceRatePct: 20,
    payload: { orderType: 'dine_in', priceMode: 'tourist' },
  })

  assert.equal(next.orders[0].service_rate_pct, 20)
  assert.equal(next.orders[0].service_fee, 24_000)
})

test('explicitly changing an unpaid order price mode also snapshots its matching service rate', () => {
  const next = ordersReducer(state({
    orders: [{
      id: 'open-order',
      table_id: 't1',
      order_type: 'dine_in',
      payment_status: 'unpaid',
      price_mode: 'regular',
      service_rate_pct: 15,
      items: [menuRow({ id: 'item-1' })],
    }],
  }), {
    type: 'UPDATE_ORDER_PRICE_MODE',
    payload: { orderId: 'open-order', priceMode: 'tourist' },
  })

  assert.equal(next.orders[0].price_mode, 'tourist')
  assert.equal(next.orders[0].service_rate_pct, 20)
  assert.equal(next.orders[0].subtotal, 120_000)
  assert.equal(next.orders[0].service_fee, 24_000)
  assert.equal(next.orders[0].total, 144_000)
})

test('reapplying the same price mode does not replace an active order snapshot', () => {
  const next = ordersReducer(state({
    settings: { serviceRate: 15, touristServiceRate: 30 },
    orders: [{
      id: 'open-tourist-order',
      table_id: 't1',
      order_type: 'dine_in',
      payment_status: 'unpaid',
      price_mode: 'tourist',
      service_rate_pct: 20,
      items: [menuRow({ id: 'item-1', unit_price: 120_000, price: 120_000, price_mode: 'tourist' })],
    }],
  }), {
    type: 'UPDATE_ORDER_PRICE_MODE',
    payload: { orderId: 'open-tourist-order', priceMode: 'tourist' },
  })

  assert.equal(next.orders[0].service_rate_pct, 20)
  assert.equal(next.orders[0].service_fee, 24_000)
})

test('tourist service migration backfills 20 without rewriting existing Regular rates', () => {
  const migration = readFileSync(new URL('../supabase/130_tourist_service_rate.sql', import.meta.url), 'utf8')
  assert.match(migration, /tourist_service_rate_pct integer/)
  assert.match(migration, /tourist_service_rate_pct set default 20/)
  assert.match(migration, /set tourist_service_rate_pct = 20/)
  assert.match(migration, /service_rate_pct set default 15/)
  assert.doesNotMatch(migration, /set service_rate_pct = 15/)
})

test('all operational and historical fallbacks use the price-mode service setting', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  const settings = read('src/pages/AdminSettings.jsx')
  const cart = read('src/components/CartPanel.jsx')
  const waiter = read('src/pages/WaiterOrder.jsx')
  const cashier = read('src/pages/CashierBill.jsx')
  const receipt = read('src/pages/Receipt.jsx')
  const reports = read('src/pages/Reports.jsx')
  const appContext = read('src/store/AppContext.jsx')
  const db = read('src/lib/db.js')

  assert.match(settings, /touristServiceRate/)
  assert.match(settings, /handleTouristServiceRateChange/)
  assert.match(cart, /getConfiguredServiceRatePct\(state\.settings, normalizedPriceMode\)/)
  assert.match(waiter, /getConfiguredServiceRatePct\(state\.settings, priceMode\)/)
  assert.match(cashier, /getConfiguredServiceRatePct\(state\.settings, firstOrder\.price_mode\)/)
  assert.match(receipt, /getConfiguredServiceRatePct\(settings, combinedOrder\.price_mode\)/)
  assert.match(reports, /getConfiguredServiceRatePct\(serviceRateSettings, order\.price_mode\)/)
  assert.match(appContext, /_serviceRatePct: serviceRatePct/)
  assert.match(db, /tourist_service_rate_pct: touristServiceRatePct/)
  assert.match(db, /isMissingTouristServiceRateColumn\(error\)[\s\S]*?legacySettingsRow/)
})
