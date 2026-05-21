import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(new URL('../supabase/021_role_based_write_policies.sql', import.meta.url), 'utf8')

test('role-aware write migration removes broad menu and zone writes', () => {
  assert.match(sql, /drop policy if exists "staff_all_categories"/)
  assert.match(sql, /drop policy if exists "staff_all_menu_items"/)
  assert.match(sql, /drop policy if exists "staff_all_table_zones"/)
  assert.match(sql, /owner_admin_write_menu_items/)
  assert.match(sql, /owner_admin_write_table_zones/)
})

test('role-aware write migration keeps operational table status updates available to staff', () => {
  assert.match(sql, /staff_update_restaurant_table_status/)
  assert.match(sql, /array\['waiter','cashier','kitchen'\]/)
})
