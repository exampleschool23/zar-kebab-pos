import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const migration = readFileSync(new URL('../supabase/183_batch_tech_card_cost_sync.sql', import.meta.url), 'utf8')

test('cost sync consumes deferred dirty events and stops when costs converge', () => {
  assert.match(migration, /current_setting\('app.tech_card_costs_dirty', true\) = 'on'/)
  assert.match(migration, /set_config\('app.tech_card_costs_dirty', 'off', true\)/)
  assert.match(migration, /get diagnostics changed_count = row_count;\s+--[^\n]*\s+exit when changed_count = 0/)
  assert.match(migration, /is distinct from \(excluded.cost_price, excluded.variant_costs, excluded.cost_source\)/)
  assert.match(migration, /app.tech_card_cost_sync_running/)
  for (const table of ['menu_item_tech_cards', 'menu_item_tech_card_ingredients', 'menu_item_tech_card_components']) {
    assert.ok(migration.includes(`before insert or update or delete on public.${table}`))
  }
})

test('manual variant costs propagate without modifying recipe permissions or history', () => {
  assert.match(migration, /after update of cost_price, variant_costs on public.menu_item_costs/)
  assert.doesNotMatch(migration, /(?:update|delete from|insert into) public\.(?:order_items|orders|order_item_tech_card_ingredient_snapshots)/)
  assert.doesNotMatch(migration, /drop policy|disable trigger|grant .*authenticated|create or replace function public.save_menu_item_tech_card/)
  assert.match(migration, /revoke all on function public.mark_tech_card_costs_dirty\(\) from public, anon, authenticated/)
})
