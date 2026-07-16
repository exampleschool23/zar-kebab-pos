import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/097_daily_bazaar.sql', import.meta.url), 'utf8')

function sqlFunction(name, nextName = '') {
  const start = migration.indexOf(`create or replace function public.${name}`)
  assert.notEqual(start, -1, `${name} should exist`)
  const next = nextName ? migration.indexOf(`create or replace function public.${nextName}`, start + 1) : -1
  return migration.slice(start, next === -1 ? migration.length : next)
}

test('Daily Bazaar migration is atomic and does not rewrite role enums or Accounting columns', () => {
  assert.match(migration, /^--[\s\S]*\nbegin;/)
  assert.match(migration, /commit;\s*$/)
  assert.doesNotMatch(migration, /add column if not exists role/)
  assert.doesNotMatch(migration, /set role\s*=/)
  assert.doesNotMatch(migration, /alter column role/)
  assert.doesNotMatch(migration, /btrim\((?:profile\.)?(?:role|status)\)/)
  assert.doesNotMatch(migration, /alter table if exists public\.expenses[\s\S]*add column/)
  assert.match(migration, /role::text/)
  assert.match(migration, /status::text/)
  assert.ok(migration.split('\n').length <= 1100, 'migration should remain focused')
})

test('Daily Bazaar adds an independent feature key and preserves current logical permissions', () => {
  assert.match(migration, /array_append\(feature_access, 'bazaar'\)/)
  assert.match(migration, /'expenses' = any\(feature_access\)/)
  assert.match(migration, /'bazaar', 'team'/)
  assert.match(migration, /array_remove\([\s\S]*'move_back_to_table'/)
  assert.match(migration, /create or replace function public\.current_staff_can_access\(feature_key text\)/)
  assert.match(migration, /create or replace function public\.current_staff_can_write\(feature_key text\)/)
})

test('Daily Bazaar verifies Accounting prerequisites without trying to repair an unknown schema', () => {
  assert.match(migration, /to_regclass\('public\.expenses'\)/)
  assert.match(migration, /information_schema\.columns/)
  assert.match(migration, /public\.expenses\.%/)
  assert.doesNotMatch(migration, /expense_date = coalesce/)
  assert.doesNotMatch(migration, /expenses_category_check/)
})

test('Daily Bazaar schema omits removed header fields and synthetic product values', () => {
  assert.match(migration, /create table if not exists public\.bazaar_purchases/)
  assert.match(migration, /expense_id\s+uuid not null unique[\s\S]*references public\.expenses\(id\) on delete cascade/)
  assert.match(migration, /buyer_profile_id\s+uuid references public\.profiles\(id\) on delete set null/)
  assert.match(migration, /create table if not exists public\.bazaar_purchase_items/)
  assert.match(migration, /quantity\s+numeric\(14,3\) not null/)
  assert.match(migration, /bazaar_purchase_items_whole_count_quantity/)
  assert.match(migration, /drop column if exists supplier[\s\S]*drop column if exists market_name[\s\S]*drop column if exists receipt_reference/)

  const purchasesDefinition = migration.match(/create table if not exists public\.bazaar_purchases \([\s\S]*?\n\);/)?.[0] || ''
  const itemsDefinition = migration.match(/create table if not exists public\.bazaar_purchase_items \([\s\S]*?\n\);/)?.[0] || ''
  assert.doesNotMatch(purchasesDefinition, /supplier|market_name|receipt_reference/)
  assert.doesNotMatch(itemsDefinition, /'other'|'entry'/)
})

test('Historical Accounting Bazaar totals are backfilled without fake product rows', () => {
  assert.match(migration, /from public\.expenses as expense/)
  assert.match(migration, /expense\.category::text = 'products_bazaar'/)
  assert.match(migration, /'accounting_backfill'/)
  assert.doesNotMatch(migration, /Unitemized bazaar purchase/)
  assert.match(migration, /drop trigger if exists sync_products_bazaar_expense/)
  assert.doesNotMatch(migration, /create trigger sync_products_bazaar_expense/)
})

test('Save RPC validates access, active employee buyer, cash/card items, and atomically mirrors one expense', () => {
  const save = sqlFunction('save_bazaar_purchase', 'delete_bazaar_purchase')
  assert.match(save, /security definer/)
  assert.match(save, /current_staff_can_write\('bazaar'\)/)
  assert.match(save, /pg_advisory_xact_lock/)
  assert.match(save, /payment_method_value not in \('cash', 'card'\)/)
  assert.match(save, /profile\.status::text = 'active'/)
  assert.match(save, /profile\.role::text <> 'guest'/)
  assert.match(save, /jsonb_array_length\(items_value\) > 100/)
  assert.match(save, /total_amount_value := total_amount_value \+ line_total_value/)
  assert.match(save, /insert into public\.expenses[\s\S]*'products_bazaar'/)
  assert.match(save, /insert into public\.bazaar_purchase_items/)
  assert.match(save, /insert into public\.bazaar_product_catalog[\s\S]*on conflict \(product_key\) do update/)
  assert.match(save, /insert into public\.bazaar_purchase_audit/)
  assert.doesNotMatch(save, /supplier|market_name|receipt_reference|'other'|'entry'/)
})

test('Accounting cannot mutate structured Bazaar expenses behind the ledger', () => {
  assert.match(migration, /create or replace function public\.prevent_direct_structured_bazaar_expense_mutation\(\)/)
  assert.match(migration, /before insert or update or delete on public\.expenses/)
  assert.match(migration, /current_setting\('app\.daily_bazaar_rpc', true\) = 'on'/)
  assert.match(migration, /Products \/ Bazaar expenses must be managed from Daily Bazaar/)

  const save = sqlFunction('save_bazaar_purchase', 'delete_bazaar_purchase')
  const remove = sqlFunction('delete_bazaar_purchase')
  assert.match(save, /set_config\('app\.daily_bazaar_rpc', 'on', true\)/)
  assert.match(remove, /set_config\('app\.daily_bazaar_rpc', 'on', true\)/)
})

test('Delete RPC removes the linked expense after locking Accounting before Bazaar', () => {
  const remove = sqlFunction('delete_bazaar_purchase')
  assert.match(remove, /current_staff_can_write\('bazaar'\)/)
  assert.match(remove, /purchase_source = 'accounting_backfill'/)
  assert.match(remove, /delete from public\.expenses[\s\S]*where id = expense_id_value/)
  assert.match(migration, /create trigger audit_bazaar_purchase_delete[\s\S]*before delete on public\.bazaar_purchases/)

  const expenseLock = remove.indexOf('perform 1\n  from public.expenses')
  const purchaseLock = remove.indexOf('and purchase.expense_id = expense_id_value\n  for update')
  assert.ok(expenseLock >= 0 && purchaseLock > expenseLock)
})

test('Daily Bazaar tables are read-only and mutations stay behind permission-checked RPCs', () => {
  assert.match(migration, /bazaar_feature_read_purchases[\s\S]*current_staff_can_access\('bazaar'\)/)
  assert.match(migration, /bazaar_feature_read_items[\s\S]*current_staff_can_access\('bazaar'\)/)
  assert.match(migration, /revoke all on table public\.bazaar_purchases from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.bazaar_purchases to authenticated/)
  assert.match(migration, /grant execute on function public\.save_bazaar_purchase\(jsonb\) to authenticated/)
  assert.match(migration, /grant execute on function public\.delete_bazaar_purchase\(uuid\) to authenticated/)
})
