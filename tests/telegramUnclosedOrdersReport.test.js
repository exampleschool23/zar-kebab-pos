import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildOpenOrdersReportSvg } from '../api/telegram/_lib/dailyOperationsReportImages.js'

test('Investor report lists every unpaid order at send time', () => {
  const svg = buildOpenOrdersReportSvg([
    { id: 'order-abc123', table_name: 'Стол 7', created_at: '2026-09-11T18:25:00Z', total: 125_000, status: 'needs_bill', items: [
      { name: 'Шашлык', quantity: 2, price: 35_000, status: 'served' },
      { name: 'Чай', quantity: 1, unit_price: 10_000, status: 'ready' },
    ] },
    { id: 'order-def456', order_type: 'delivery', created_at: '2026-09-11T19:05:00Z', total: 80_000, status: 'preparing', items: [] },
  ])
  assert.match(svg, /НЕЗАКРЫТЫЕ ЗАКАЗЫ · 2/)
  assert.match(svg, /Стол 7 · #ABC123/)
  assert.match(svg, /23:25 · Нужен счёт/)
  assert.match(svg, /Доставка · #DEF456/)
  assert.match(svg, /00:05 · Готовится/)
  assert.match(svg, /125.000 UZS/)
  assert.match(svg, /80.000 UZS/)
  assert.match(svg, /2 × Шашлык/)
  assert.match(svg, /70.000 UZS/)
  assert.match(svg, /1 × Чай/)
})

test('Investor report shows a clear state when all orders are closed', () => {
  const svg = buildOpenOrdersReportSvg([])
  assert.match(svg, /НЕЗАКРЫТЫЕ ЗАКАЗЫ · 0/)
  assert.match(svg, /Все заказы закрыты/)
})

test('daily report queries current unpaid non-cancelled orders without a business-date filter', () => {
  const source = fs.readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  assert.match(source, /select\('id, table_id, table_name, order_type, created_at, subtotal, service_fee, total, status, payment_status, items:order_items\(name, quantity, price, unit_price, status\)'\)[\s\S]*?\.eq\('payment_status', 'unpaid'\)[\s\S]*?\.order\('created_at', \{ ascending: true \}\)/)
  assert.match(source, /openOrders: openOrdersResult\.data \|\| \[\]/)
  assert.match(source, /kind: 'openOrders'[\s\S]*buildOpenOrdersReportPng\(summary\.openOrders\)/)
  assert.match(source, /photos\.length > 1/)
})
