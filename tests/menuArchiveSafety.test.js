import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/127_reject_archived_order_items.sql', import.meta.url),
  'utf8'
)

test('new order items cannot reference an archived or missing menu product', () => {
  assert.match(migration, /create or replace function public\.reject_archived_menu_item_ordering\(\)/)
  assert.match(migration, /if new\.menu_item_id is null then[\s\S]*return new/)
  assert.match(migration, /if tg_op = 'UPDATE' then[\s\S]*if new\.menu_item_id is not distinct from old\.menu_item_id[\s\S]*new\.quantity[\s\S]*<= coalesce\(old\.quantity, 0\)/)
  assert.match(migration, /select item\.deleted_at[\s\S]*from public\.menu_items item[\s\S]*item\.id = new\.menu_item_id[\s\S]*for share/)
  assert.match(migration, /if not found or archived_at is not null then/)
  assert.match(migration, /raise exception 'Menu item % is archived or missing from the catalog'/)
  assert.match(migration, /before insert or update of menu_item_id, quantity on public\.order_items/)
  assert.doesNotMatch(migration, /before delete on public\.order_items/)
  assert.doesNotMatch(migration, /\bavailable\b/i)
})
