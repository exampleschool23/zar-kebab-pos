import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/163_daily_bazaar_price_variance_snapshots.sql', import.meta.url), 'utf8')

test('Bazaar lines snapshot normal price and signed variance', () => {
  assert.match(migration, /add column if not exists normal_unit_price integer not null default 0/)
  assert.match(migration, /add column if not exists normal_line_total bigint not null default 0/)
  assert.match(migration, /add column if not exists price_difference bigint not null default 0/)
  assert.match(migration, /new\.normal_line_total := round\(new\.quantity \* snapshot_price\)::bigint/)
  assert.match(migration, /new\.price_difference := new\.line_total::bigint - new\.normal_line_total/)
})

test('editing a durable line reuses its original normal-price snapshot', () => {
  assert.match(migration, /from public\.bazaar_purchase_audit as audit/)
  assert.match(migration, /prior\.item ->> 'id' = new\.id::text/)
  assert.match(migration, /snapshot_price := coalesce\(nullif\(previous_item ->> 'normal_unit_price'/)
  assert.match(migration, /if snapshot_price <= 0 then[\s\S]*snapshot_price := ingredient\.normal_unit_price/)
})
