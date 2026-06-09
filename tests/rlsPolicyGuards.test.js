import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(new URL('../supabase/021_role_based_write_policies.sql', import.meta.url), 'utf8')
const removeKitchenRoleSql = fs.readFileSync(new URL('../supabase/035_remove_kitchen_profile_role.sql', import.meta.url), 'utf8')
const deleteProfilesSql = fs.readFileSync(new URL('../supabase/025_owner_delete_profiles.sql', import.meta.url), 'utf8')
const adminCannotEditAdminsSql = fs.readFileSync(new URL('../supabase/026_admin_cannot_edit_admins.sql', import.meta.url), 'utf8')

test('role-aware write migration removes broad menu and zone writes', () => {
  assert.match(sql, /drop policy if exists "staff_all_categories"/)
  assert.match(sql, /drop policy if exists "staff_all_menu_items"/)
  assert.match(sql, /drop policy if exists "staff_all_table_zones"/)
  assert.match(sql, /owner_admin_write_menu_items/)
  assert.match(sql, /owner_admin_write_table_zones/)
})

test('role-aware write migration keeps operational table status updates available to staff', () => {
  assert.match(sql, /staff_update_restaurant_table_status/)
  assert.match(sql, /array\['waiter','cashier'\]/)
  assert.doesNotMatch(sql, /array\[[^\]]*'kitchen'/)
})

test('kitchen profile role retirement removes it from assignable database roles', () => {
  assert.match(removeKitchenRoleSql, /where role = 'kitchen'/)
  assert.match(removeKitchenRoleSql, /check \(role in \('owner', 'admin', 'waiter', 'cashier', 'stakeholder', 'guest'\)\)/)
  assert.match(removeKitchenRoleSql, /array\['waiter','cashier'\]/)
  assert.doesNotMatch(removeKitchenRoleSql, /'owner', 'admin', 'waiter', 'cashier', 'kitchen'/)
})

test('waiters can write item cancellation records for unavailable order items', () => {
  assert.match(removeKitchenRoleSql, /order_item_cancellations/)
  assert.match(removeKitchenRoleSql, /array\['owner','admin','waiter'\]/)
})

test('owner delete profile policy preserves protected users and historical order names', () => {
  assert.match(deleteProfilesSql, /on public\.profiles for delete/)
  assert.match(deleteProfilesSql, /public\.is_owner\(\)/)
  assert.match(deleteProfilesSql, /id <> auth\.uid\(\)/)
  assert.match(deleteProfilesSql, /role not in \('owner', 'stakeholder'\)/)
  assert.match(deleteProfilesSql, /waiter_name/)
  assert.doesNotMatch(deleteProfilesSql, /delete from public\.orders/i)
  assert.doesNotMatch(deleteProfilesSql, /auth\.users/)
})

test('admin profile update policy cannot edit or assign admin role', () => {
  assert.match(adminCannotEditAdminsSql, /drop policy if exists "Admin: update staff profiles"/)
  assert.match(adminCannotEditAdminsSql, /on public\.profiles for update/)
  assert.match(adminCannotEditAdminsSql, /id <> auth\.uid\(\)/)
  assert.match(adminCannotEditAdminsSql, /role not in \('owner', 'admin', 'stakeholder'\)/)
})
