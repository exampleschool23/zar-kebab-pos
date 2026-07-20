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
const primaryOwnerFeatureAccessSql = fs.readFileSync(new URL('../supabase/068_primary_owner_feature_access_manager.sql', import.meta.url), 'utf8')
const manageNonPrimaryOwnersSql = fs.readFileSync(new URL('../supabase/069_manage_non_primary_owner_profiles.sql', import.meta.url), 'utf8')
const featureAccessPosPoliciesSql = fs.readFileSync(new URL('../supabase/073_feature_access_pos_policies.sql', import.meta.url), 'utf8')
const fourRoleFeatureAccessSql = fs.readFileSync(new URL('../supabase/077_four_role_feature_access.sql', import.meta.url), 'utf8')
const logicalFeatureAccessSql = fs.readFileSync(new URL('../supabase/092_logical_feature_access.sql', import.meta.url), 'utf8')
const pendingRequestLifecycleSql = fs.readFileSync(new URL('../supabase/093_team_pending_request_lifecycle.sql', import.meta.url), 'utf8')
const adminCashierRecallSql = fs.readFileSync(new URL('../supabase/094_admin_cashier_recall_access.sql', import.meta.url), 'utf8')
const readOnlyMenuCatalogSql = fs.readFileSync(new URL('../supabase/095_read_only_menu_catalog_access.sql', import.meta.url), 'utf8')
const salaryFinesSql = fs.readFileSync(new URL('../supabase/099_employee_salary_fines.sql', import.meta.url), 'utf8')

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

test('four-role migration maps legacy roles to feature-gated admin and viewer users', () => {
  assert.match(fourRoleFeatureAccessSql, /set role = 'viewer'\s+where role = 'stakeholder'/)
  assert.match(fourRoleFeatureAccessSql, /set role = 'admin'\s+where role in \('waiter', 'cashier', 'kitchen'\)/)
  assert.match(fourRoleFeatureAccessSql, /check \(role in \('owner', 'admin', 'viewer', 'guest'\)\)/)
  assert.match(fourRoleFeatureAccessSql, /array\['tables','team'\]::text\[\][\s\S]*where role = 'waiter'/)
  assert.match(fourRoleFeatureAccessSql, /array\['dashboard','team','reports'\]::text\[\][\s\S]*where role = 'stakeholder'/)
})

test('profile feature access migration protects owner-managed feature overrides', () => {
  assert.match(featureAccessSql, /add column if not exists feature_access text\[\]/)
  assert.match(featureAccessSql, /current_staff_can_access\(feature_key text\)/)
  assert.match(featureAccessSql, /when p\.feature_access is not null then feature_key = any\(p\.feature_access\)/)
  assert.match(featureAccessSql, /prevent_non_owner_feature_access_update/)
  assert.match(featureAccessSql, /Only owners can change feature access/)
})

test('feature access changes are limited to owners in the final role model', () => {
  assert.match(fourRoleFeatureAccessSql, /prevent_non_owner_feature_access_update/)
  assert.match(fourRoleFeatureAccessSql, /not public\.is_owner\(\)/)
  assert.match(fourRoleFeatureAccessSql, /Only owners can change feature access/)
  assert.match(fourRoleFeatureAccessSql, /when p\.role = 'owner' and lower\(coalesce\(p\.email, ''\)\) = 'dangerhoggish@gmail\.com' then true/)
})

test('owner can delete admins but owners remain protected from profile deletion', () => {
  assert.match(fourRoleFeatureAccessSql, /create policy "Owner: delete staff profiles"/)
  assert.match(fourRoleFeatureAccessSql, /public\.is_owner\(\)/)
  assert.match(fourRoleFeatureAccessSql, /id <> auth\.uid\(\)/)
  assert.match(fourRoleFeatureAccessSql, /role <> 'owner'/)
  assert.doesNotMatch(fourRoleFeatureAccessSql, /role <> 'stakeholder'/)
})

test('admins can update only viewer and guest profiles when team write access is granted', () => {
  assert.match(fourRoleFeatureAccessSql, /create policy "Admin: update staff profiles"/)
  assert.match(fourRoleFeatureAccessSql, /public\.current_staff_role\(\) = 'admin'/)
  assert.match(fourRoleFeatureAccessSql, /public\.current_staff_can_write\('team'\)/)
  assert.match(fourRoleFeatureAccessSql, /role in \('viewer', 'guest'\)/)
  assert.doesNotMatch(fourRoleFeatureAccessSql, /role not in \('owner', 'admin', 'stakeholder'\)/)
})

test('accounting read policies honor explicit expenses feature access', () => {
  assert.match(featureAccessSql, /feature_access_read_expenses/)
  assert.match(featureAccessSql, /using \(public\.current_staff_can_access\('expenses'\)\)/)
  assert.match(featureAccessSql, /feature_access_read_employee_salary_profiles/)
  assert.match(featureAccessSql, /feature_access_read_employee_salary_rates/)
  assert.match(featureAccessSql, /feature_access_read_employee_salary_payments/)
})

test('accounting write policies require editor role plus expenses feature access', () => {
  assert.match(fourRoleFeatureAccessSql, /current_staff_can_write\(feature_key text\)/)
  assert.match(fourRoleFeatureAccessSql, /p\.role in \('owner', 'admin'\)/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_write_expenses/)
  assert.match(fourRoleFeatureAccessSql, /public\.current_staff_can_write\('expenses'\)/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_write_employee_salary_profiles/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_write_employee_salary_payments/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_write_employee_salary_bonuses/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_write_employee_salary_absences/)
  assert.match(salaryFinesSql, /feature_access_read_employee_salary_fines/)
  assert.match(salaryFinesSql, /feature_access_write_employee_salary_fines/)
  assert.match(salaryFinesSql, /public\.current_staff_can_access\('expenses'\)/)
  assert.match(salaryFinesSql, /public\.current_staff_can_write\('expenses'\)/)
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

test('logical feature access removes duplicate menu edit access and orphaned actions', () => {
  assert.match(logicalFeatureAccessSql, /array_append\(feature_access, 'menu'\)/)
  assert.match(logicalFeatureAccessSql, /array_remove\(feature_access, 'edit_menu_items'\)/)
  assert.match(logicalFeatureAccessSql, /when 'move_back_to_table' then 'cashier' = any\(profile\.feature_access\)/)
  assert.match(logicalFeatureAccessSql, /when 'delete_paid_orders' then profile\.feature_access && array\['dashboard','cashier','reports'\]/)
  assert.match(logicalFeatureAccessSql, /not \('move_back_to_table' = any\(feature_access\)\)[\s\S]*'cashier' = any\(feature_access\)/)
  assert.match(logicalFeatureAccessSql, /not \('delete_paid_orders' = any\(feature_access\)\)[\s\S]*feature_access && array\['dashboard','cashier','reports'\]/)
  assert.doesNotMatch(logicalFeatureAccessSql, /'edit_menu_items',\s*\n\s*'cashier'/)
})

test('final order policies remove authenticated catch-alls and role-gate writes', () => {
  assert.match(logicalFeatureAccessSql, /drop policy if exists staff_all_orders on public\.orders/)
  assert.match(logicalFeatureAccessSql, /drop policy if exists staff_all_order_items on public\.order_items/)
  assert.match(logicalFeatureAccessSql, /feature_access_read_orders/)
  assert.match(logicalFeatureAccessSql, /feature_access_update_orders/)
  assert.match(logicalFeatureAccessSql, /feature_access_read_order_items/)
  assert.match(logicalFeatureAccessSql, /feature_access_update_order_items/)
  assert.match(logicalFeatureAccessSql, /public\.current_staff_can_write\('tables'\)/)
  assert.match(logicalFeatureAccessSql, /public\.current_staff_can_write\('cashier'\)/)
})

test('move back to table is checked atomically and guarded against direct updates', () => {
  assert.match(logicalFeatureAccessSql, /recall_table_from_cashier\(p_table_id text\)/)
  assert.match(logicalFeatureAccessSql, /current_staff_can_write\('cashier'\)[\s\S]*current_staff_can_access\('move_back_to_table'\)/)
  assert.match(logicalFeatureAccessSql, /guard_recall_from_cashier_permission/)
  assert.match(logicalFeatureAccessSql, /payment_status is distinct from 'paid'/)
  assert.match(logicalFeatureAccessSql, /status = 'needs_bill'/)
})

test('final recall access is automatic for owner and admin cashier editors', () => {
  assert.match(adminCashierRecallSql, /auth\.uid\(\) is not null[\s\S]*not public\.is_owner\(\)/)
  assert.match(adminCashierRecallSql, /Only owners can change feature access/)
  assert.match(adminCashierRecallSql, /array_remove\(feature_access, 'move_back_to_table'\)/)
  assert.match(adminCashierRecallSql, /public\.current_staff_can_write\('cashier'\)/)
  assert.match(adminCashierRecallSql, /guard_recall_from_cashier_permission/)
  assert.match(adminCashierRecallSql, /recall_table_from_cashier\(p_table_id text\)/)
  assert.doesNotMatch(adminCashierRecallSql, /current_staff_can_access\('move_back_to_table'\)/)
  assert.match(adminCashierRecallSql, /'settings',\s*\n\s*'delete_paid_orders'/)
})

test('deleted auth accounts are not resurrected as pending approval requests', () => {
  assert.match(pendingRequestLifecycleSql, /public\.profile_audit as audit/)
  assert.match(pendingRequestLifecycleSql, /audit\.action = 'profile_deleted'/)
  assert.match(pendingRequestLifecycleSql, /profiles\.role = 'guest'/)
  assert.match(pendingRequestLifecycleSql, /profiles\.status = 'pending'/)
  assert.match(pendingRequestLifecycleSql, /users\.last_sign_in_at/)
  assert.match(pendingRequestLifecycleSql, /delete from auth\.users as users/)
  assert.match(pendingRequestLifecycleSql, /old\.status <> 'pending' and new\.status = 'pending'/)
})

test('POS RLS policies honor explicit feature access instead of role-only checks', () => {
  assert.match(featureAccessPosPoliciesSql, /current_staff_can_access_any\(feature_keys text\[\]\)/)
  assert.match(featureAccessPosPoliciesSql, /feature_access_read_restaurant_tables/)
  assert.match(featureAccessPosPoliciesSql, /public\.current_staff_can_access_any\(array\['dashboard','tables','cashier','reports','settings'\]\)/)
  assert.match(featureAccessPosPoliciesSql, /feature_access_update_restaurant_table_status/)
  assert.match(featureAccessPosPoliciesSql, /public\.current_staff_can_access_any\(array\['tables','cashier'\]\)/)
  assert.match(featureAccessPosPoliciesSql, /feature_access_read_table_zones/)
  assert.match(featureAccessPosPoliciesSql, /feature_access_read_menu_items/)
  assert.match(featureAccessPosPoliciesSql, /feature_access_read_business_settings/)
  assert.match(featureAccessPosPoliciesSql, /feature_access_read_order_payments/)
  assert.doesNotMatch(featureAccessPosPoliciesSql, /current_staff_has_role/)
  assert.doesNotMatch(featureAccessPosPoliciesSql, /array\['owner','admin','waiter','cashier','stakeholder'\]/)
})

test('final POS write policies require feature write access, not viewer-only access', () => {
  assert.match(fourRoleFeatureAccessSql, /feature_access_write_menu_items/)
  assert.match(fourRoleFeatureAccessSql, /public\.current_staff_can_write\('menu'\)/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_update_restaurant_table_status/)
  assert.match(fourRoleFeatureAccessSql, /public\.current_staff_can_write\('tables'\) or public\.current_staff_can_write\('cashier'\)/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_insert_order_payments/)
  assert.match(fourRoleFeatureAccessSql, /public\.current_staff_can_write\('cashier'\)/)
  assert.match(fourRoleFeatureAccessSql, /feature_access_insert_order_item_cancellations/)
  assert.doesNotMatch(fourRoleFeatureAccessSql, /array\['owner','admin','waiter','cashier','stakeholder'\]/)
})

test('read-only staff can inspect the full menu without receiving menu write access', () => {
  assert.match(readOnlyMenuCatalogSql, /current_staff_can_view_menu_catalog\(\)/)
  assert.match(readOnlyMenuCatalogSql, /profile\.status = 'active'/)
  assert.match(readOnlyMenuCatalogSql, /profile\.role in \('owner', 'admin', 'viewer'\)/)
  assert.match(readOnlyMenuCatalogSql, /feature_access_read_menu_categories/)
  assert.match(readOnlyMenuCatalogSql, /feature_access_read_menu_items/)
  assert.match(readOnlyMenuCatalogSql, /using \(public\.current_staff_can_view_menu_catalog\(\)\)/)
  assert.doesNotMatch(readOnlyMenuCatalogSql, /feature_access_write_menu/)
  assert.doesNotMatch(readOnlyMenuCatalogSql, /current_staff_can_write\('menu'\)/)
})
