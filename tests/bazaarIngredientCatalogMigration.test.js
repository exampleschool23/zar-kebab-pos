import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/160_daily_bazaar_ingredient_catalog.sql', import.meta.url), 'utf8')

test('Bazaar ingredient catalog stores normal prices and archives instead of deleting', () => {
  assert.match(migration, /add column if not exists normal_unit_price integer not null default 0/)
  assert.match(migration, /add column if not exists is_active boolean not null default true/)
  assert.match(migration, /normal_unit_price >= 0/)
  assert.match(migration, /create or replace function public\.set_bazaar_ingredient_active/)
  assert.doesNotMatch(migration, /delete from public\.bazaar_product_catalog/)
})

test('catalog writes require owner access and use permission-checked RPCs', () => {
  assert.match(migration, /create or replace function public\.save_bazaar_ingredient\(payload jsonb\)/)
  assert.match(migration, /create or replace function public\.current_staff_can_manage_bazaar_ingredients\(\)/)
  assert.match(migration, /profile\.role::text = 'owner'/)
  assert.match(migration, /current_staff_can_manage_bazaar_ingredients\(\)/)
  assert.match(migration, /grant execute on function public\.save_bazaar_ingredient\(jsonb\) to authenticated/)
  assert.match(migration, /grant execute on function public\.set_bazaar_ingredient_active\(text, boolean\) to authenticated/)
  assert.match(migration, /Archive this ingredient and add a new one to change its name/)
})

test('new Bazaar purchase lines must use an active canonical catalog ingredient', () => {
  assert.match(migration, /create or replace function public\.require_bazaar_catalog_ingredient\(\)/)
  assert.match(migration, /where catalog\.product_key = new\.product_key[\s\S]*and catalog\.is_active/)
  assert.match(migration, /new\.product_name := ingredient\.product_name/)
  assert.match(migration, /new\.category := ingredient\.category/)
  assert.match(migration, /new\.unit := ingredient\.unit/)
  assert.match(migration, /before insert on public\.bazaar_purchase_items/)
})

test('purchase saves cannot rewrite canonical catalog definitions', () => {
  assert.match(migration, /create or replace function public\.guard_bazaar_product_catalog_identity\(\)/)
  assert.match(migration, /current_setting\('app\.daily_bazaar_catalog_rpc', true\) = 'on'/)
  assert.match(migration, /new\.normal_unit_price := old\.normal_unit_price/)
  assert.match(migration, /new\.is_active := old\.is_active/)
})
