import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(new URL('../supabase/021_role_based_write_policies.sql', import.meta.url), 'utf8')
const removeKitchenRoleSql = fs.readFileSync(new URL('../supabase/035_remove_kitchen_profile_role.sql', import.meta.url), 'utf8')
const deleteProfilesSql = fs.readFileSync(new URL('../supabase/025_owner_delete_profiles.sql', import.meta.url), 'utf8')
const adminCannotEditAdminsSql = fs.readFileSync(new URL('../supabase/026_admin_cannot_edit_admins.sql', import.meta.url), 'utf8')
const featureAccessSql = fs.readFileSync(new URL('../supabase/064_profile_feature_access.sql', import.meta.url), 'utf8')
const deletePaidOrdersFeatureSql = fs.readFileSync(new URL('../supabase/066_delete_paid_orders_feature_access.sql', import.meta.url), 'utf8')
const moveBackToTableFeatureSql = fs.readFileSync(new URL('../supabase/067_move_back_to_table_feature_access.sql', import.meta.url), 'utf8')

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

test('profile feature access migration protects owner-managed feature overrides', () => {
  assert.match(featureAccessSql, /add column if not exists feature_access text\[\]/)
  assert.match(featureAccessSql, /current_staff_can_access\(feature_key text\)/)
  assert.match(featureAccessSql, /when p\.feature_access is not null then feature_key = any\(p\.feature_access\)/)
  assert.match(featureAccessSql, /prevent_non_owner_feature_access_update/)
  assert.match(featureAccessSql, /Only owners can change feature access/)
})

test('accounting read policies honor explicit expenses feature access', () => {
  assert.match(featureAccessSql, /feature_access_read_expenses/)
  assert.match(featureAccessSql, /using \(public\.current_staff_can_access\('expenses'\)\)/)
  assert.match(featureAccessSql, /feature_access_read_employee_salary_profiles/)
  assert.match(featureAccessSql, /feature_access_read_employee_salary_rates/)
  assert.match(featureAccessSql, /feature_access_read_employee_salary_payments/)
})

test('paid order deletion can be granted as explicit feature access', () => {
  assert.match(deletePaidOrdersFeatureSql, /'delete_paid_orders'/)
  assert.match(deletePaidOrdersFeatureSql, /profiles_feature_access_valid/)
  assert.match(deletePaidOrdersFeatureSql, /current_staff_can_access\(feature_key text\)/)
  assert.match(deletePaidOrdersFeatureSql, /when feature_key = 'delete_paid_orders' then false/)
  assert.match(deletePaidOrdersFeatureSql, /delete_order_owner\(p_order_id text\)/)
  assert.match(deletePaidOrdersFeatureSql, /current_staff_can_access\('delete_paid_orders'\)/)
})

test('move back to table can be granted as explicit feature access', () => {
  assert.match(moveBackToTableFeatureSql, /'move_back_to_table'/)
  assert.match(moveBackToTableFeatureSql, /profiles_feature_access_valid/)
  assert.match(moveBackToTableFeatureSql, /current_staff_can_access\(feature_key text\)/)
  assert.match(moveBackToTableFeatureSql, /when feature_key = 'move_back_to_table' then false/)
  assert.match(moveBackToTableFeatureSql, /when feature_key = 'delete_paid_orders' then false/)
})
