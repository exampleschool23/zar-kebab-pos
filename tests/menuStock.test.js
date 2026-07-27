import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/106_atomic_paid_order_stock_deduction.sql', import.meta.url),
  'utf8',
)
const schema = readFileSync(new URL('../supabase/003_pos_schema.sql', import.meta.url), 'utf8')
const dbHealth = readFileSync(new URL('../src/lib/dbHealth.js', import.meta.url), 'utf8')
const dbHealthScript = readFileSync(new URL('../scripts/check-db-health.js', import.meta.url), 'utf8')

test('paid orders deduct tracked shelf stock atomically exactly once', () => {
  assert.match(schema, /stock_deducted_at\s+timestamptz/)
  assert.match(migration, /add column if not exists stock_deducted_at timestamptz/)
  assert.match(migration, /where stock_deducted_at is null[\s\S]*payment_status = 'paid'/)
  assert.match(migration, /old\.stock_deducted_at is not null[\s\S]*new\.stock_deducted_at := old\.stock_deducted_at/)
  assert.match(migration, /if old_paid or not new_paid then/)
  assert.match(migration, /new\.stock_deducted_at := now\(\)/)
  assert.match(migration, /create trigger apply_paid_order_stock[\s\S]*before update on public\.orders/)
})

test('stock deduction uses only non-cancelled piece quantities and never goes negative', () => {
  assert.match(migration, /coalesce\(oi\.status, ''\) <> 'cancelled'/)
  assert.match(migration, /coalesce\(oi\.sale_unit, 'piece'\) = 'piece'/)
  assert.match(migration, /greatest\(stock_count - sold_quantity, 0\)/)
  assert.match(migration, /stock_count > 0/)
})

test('selected product variant stock is deducted with the parent product stock', () => {
  assert.match(migration, /decrement_selected_variant_stock/)
  assert.match(migration, /selected_options/)
  assert.match(migration, /option_value ->> 'id' = selected_option_id/)
  assert.match(migration, /greatest\(option_stock - quantity_to_deduct, 0\)/)
})

test('database health requires the paid-order stock migration', () => {
  assert.match(dbHealth, /'stock_deducted_at'/)
  assert.match(dbHealth, /106_atomic_paid_order_stock_deduction/)
  assert.match(dbHealthScript, /cashback_earned, stock_deducted_at/)
})
