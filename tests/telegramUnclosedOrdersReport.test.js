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
  assert.match(source, /select\('id, table_id, table_name, order_type, created_at, subtotal, service_fee, total, status, payment_status, items:order_items\(menu_item_id, name, quantity, price, unit_price, status, selected_options, notes\)'\)[\s\S]*?\.eq\('payment_status', 'unpaid'\)\s*\.neq\('status', 'cancelled'\)\s*\.order\('created_at', \{ ascending: true \}\)/)
  assert.match(source, /const openOrders = openOrdersResult\.data \|\| \[\]/)
  assert.match(source, /kind: 'openOrders'[\s\S]*buildOpenOrdersReportPng\(summary\.openOrders\)/)
  assert.match(source, /photos\.length > 1/)
})


test('open report excludes cancelled and paid orders and cancelled items', () => {
  const svg = buildOpenOrdersReportSvg([
    { id: 'cancel', status: 'cancelled', payment_status: 'unpaid' },
    { id: 'paid', status: 'served', payment_status: 'paid' },
    { id: 'void', payment_status: 'cancelled' },
    { id: 'active', status: 'delivered', payment_status: 'unpaid', items: [
      { name: 'Удалённая позиция', status: 'cancelled', quantity: 1 },
      { name: 'Чай', quantity: 1 },
    ] },
  ])
  assert.match(svg, /НЕЗАКРЫТЫЕ ЗАКАЗЫ · 1/)
  assert.match(svg, /Доставлен/)
  assert.doesNotMatch(svg, /CANCEL|PAID|VOID|Удалённая позиция|cancelled/)
})

test('open report localizes saved place labels and catalog item variants', () => {
  const svg = buildOpenOrdersReportSvg([
    { table_name: 'Stol 3', items: [{ name: 'Osh Seti', quantity: 2, price: 40000,
      selected_options: { size: 'large' }, menu_item: { name_ru: 'Сет с пловом', option_groups: [
        { id: 'size', options: [{ id: 'large', label_ru: 'Большой' }] },
      ] } }] },
    { table_name: 'Take Away', order_type: 'take_away' },
    { table_name: 'Delivery', order_type: 'delivery' },
    { table_name: 'Game Club', order_type: 'game_club' },
    { table_name: 'Table 9' },
  ])
  assert.match(svg, /Стол 3/)
  assert.match(svg, /Стол 9/)
  assert.match(svg, /Заказ с собой/)
  assert.match(svg, /Доставка/)
  assert.match(svg, /Игровой клуб/)
  assert.match(svg, /2 × Сет с пловом · Большой/)
  assert.match(svg, /80.000 UZS/)
  assert.doesNotMatch(svg, /Stol|Table|Take Away|Delivery|Game Club|Osh Seti/)
})
