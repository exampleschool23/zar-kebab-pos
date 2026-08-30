import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/161_reset_daily_bazaar_ingredient_catalog.sql', import.meta.url), 'utf8')

test('catalog reset hides imported suggestions without deleting Bazaar history', () => {
  assert.match(migration, /add column if not exists is_catalog_managed boolean not null default false/)
  assert.match(migration, /update public\.bazaar_product_catalog[\s\S]*set is_catalog_managed = false/)
  assert.doesNotMatch(migration, /delete from public\.bazaar_product_catalog/)
  assert.doesNotMatch(migration, /(?:delete|update) (?:from )?public\.bazaar_purchase(?:s|_items)/)
})

test('only ingredients saved through the management RPC become selectable', () => {
  assert.match(migration, /current_setting\('app\.daily_bazaar_catalog_rpc', true\) = 'on'[\s\S]*new\.is_catalog_managed := true/)
  assert.match(migration, /where catalog\.product_key = new\.product_key[\s\S]*and catalog\.is_catalog_managed[\s\S]*and catalog\.is_active/)
  assert.match(migration, /before insert or update on public\.bazaar_product_catalog/)
})
