import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/135_reconcile_cashier_quick_items_before_payment.sql', import.meta.url),
  'utf8'
)

test('payment wrapper reconciles legacy cashier quick items before strict settlement', () => {
  assert.match(migration, /create or replace function public\.settle_orders_payment\(payload jsonb\)/i)
  assert.match(migration, /coalesce\(mi\.show_in_cashier_quick_items, false\)/i)
  assert.match(migration, /set item_type = 'counter',[\s\S]*is_counter_item = true/i)
  assert.match(migration, /return public\.settle_orders_payment_strict\(payload\)/i)
})

test('cashier quick reconciliation is limited to the targeted unpaid order set', () => {
  assert.match(migration, /target_order_id is not null and o\.id = target_order_id/i)
  assert.match(migration, /target_order_id is null and o\.table_id = target_table_id/i)
  assert.match(migration, /coalesce\(o\.payment_status, 'unpaid'\) <> 'paid'/i)
  assert.match(migration, /o\.paid_at is null/i)
  assert.match(migration, /not in \('paid', 'completed', 'cancelled'\)/i)
})

test('migration refuses a stale strict settlement implementation', () => {
  assert.match(migration, /position\('is_counter_item' in strict_definition\) = 0/i)
  assert.match(migration, /position\('menu_subtotal' in strict_definition\) = 0/i)
  assert.match(migration, /does not contain counter-item service separation/i)
})
