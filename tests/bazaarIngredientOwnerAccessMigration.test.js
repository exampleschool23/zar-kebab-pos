import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/162_owner_only_bazaar_ingredient_management.sql', import.meta.url), 'utf8')

test('only an active owner with Bazaar access may manage ingredients', () => {
  assert.match(migration, /profile\.status::text = 'active'/)
  assert.match(migration, /profile\.role::text = 'owner'/)
  assert.match(migration, /current_staff_can_access\('bazaar'\)/)
})

test('the catalog trigger blocks non-owner writes even through an older RPC definition', () => {
  assert.match(migration, /current_setting\('app\.daily_bazaar_catalog_rpc', true\) = 'on'/)
  assert.match(migration, /if not public\.current_staff_can_manage_bazaar_ingredients\(\)/)
  assert.match(migration, /raise exception 'Only an owner can manage Daily Bazaar ingredients'/)
  assert.doesNotMatch(migration, /save_bazaar_purchase/)
})
