import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildInvestorOrderChangeMessage } from '../api/telegram/_lib/investorIncomeMessages.js'

const migration = readFileSync(new URL('../supabase/175_order_change_investor_notifications.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')

test('order deletion and tender correction are queued transactionally for Investor', () => {
  assert.match(migration, /before delete on public\.orders/i)
  assert.match(migration, /after update of method on public\.order_payments/i)
  assert.match(migration, /unique \(event_type, order_id, transaction_id\)/i)
  assert.match(migration, /old_payment_methods[\s\S]*new_payment_methods/)
  assert.match(migration, /target_key\s+text not null default 'salary_events'/i)
  assert.match(migration, /on conflict \(event_type, order_id, transaction_id\) do update/i)
})

test('successful order mutations request duplicate-safe Investor delivery', () => {
  assert.match(db, /case 'CHANGE_PAID_ORDER_PAYMENT_METHOD':[\s\S]*notifyTelegramInvestorOrderChange\(orderIds\)/)
  assert.match(db, /case 'CHANGE_PAID_ORDER_PAYMENT_METHODS':[\s\S]*data\?\.orderIds[\s\S]*case 'DELETE_ORDER'/)
  assert.match(db, /case 'DELETE_ORDER':[\s\S]*notifyTelegramInvestorOrderChange\(orderId\)/)
  assert.match(endpoint, /notificationType === 'order_change'/)
  assert.match(endpoint, /notifyInvestorOrderChanges\(supabase, user, orderIds\)/)
  assert.match(endpoint, /canRetryInvestorExpenseDelivery\(delivery\)/)
  assert.match(endpoint, /buildInvestorOrderChangeMessage\(claimed\.data, target\.language\)/)
})

test('Investor order-change message contains immutable audit details', () => {
  const message = buildInvestorOrderChangeMessage({
    event_type: 'payment_method_changed', order_id: 'abc', order_number: '1042',
    table_name: 'A-4', total: 125000, actor_name: 'Owner <One>',
    old_payment_methods: [{ method: 'cash', amount: 125000 }],
    new_payment_methods: [{ method: 'card', amount: 125000 }],
  }, 'en')
  assert.match(message, /Payment method changed/)
  assert.match(message, /#1042/)
  assert.match(message, /A-4/)
  assert.match(message, /Cash — 125\D000 UZS/)
  assert.match(message, /Card — 125\D000 UZS/)
  assert.match(message, /Owner &lt;One&gt;/)
})

test('deleted-order alert is compact and omits unavailable payment history', () => {
  const message = buildInvestorOrderChangeMessage({
    event_type: 'order_deleted', order_number: 'DL-0109', table_name: 'Delivery',
    total: 185000, actor_name: 'Javoxirbek Shomurodov', old_payment_methods: [],
  }, 'ru')
  assert.match(message, /🗑 <b>Удалён заказ #DL-0109<\/b> · Доставка · <b>185\D000 UZS<\/b>/)
  assert.match(message, /👤 Javoxirbek Shomurodov/)
  assert.doesNotMatch(message, /Было|—/)
  assert.equal(message.split('\n').length, 2)
})
