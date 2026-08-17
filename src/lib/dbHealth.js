import { supabase } from './supabase.js'

const TABLE_CHECKS = [
  { name: 'restaurant_tables', columns: ['id', 'name', 'status', 'capacity', 'sort_order', 'is_active', 'reserved_at'] },
  { name: 'table_zones', columns: ['id', 'name', 'sort_order', 'is_active'] },
  { name: 'orders', columns: ['id', 'table_id', 'status', 'payment_status', 'total', 'service_rate_pct', 'loyalty_card_number', 'loyalty_used_amount', 'cashback_earned', 'price_mode', 'opened_by_name', 'completed_by_name', 'stock_deducted_at'] },
  { name: 'order_items', columns: ['id', 'order_id', 'menu_item_id', 'status', 'quantity', 'sale_unit', 'base_price', 'unit_price', 'price_mode', 'selected_options', 'cost_price'] },
  { name: 'order_kitchen_rounds', columns: ['order_id', 'kitchen_round_id', 'item_ids', 'table_id', 'submitted_by', 'submitted_at', 'created_at'] },
  { name: 'order_payments', columns: ['id', 'order_id', 'method', 'amount'] },
  { name: 'business_settings', columns: ['id', 'service_rate_pct', 'tourist_service_rate_pct', 'restaurant_name', 'monthly_rent_uzs', 'monthly_utilities_uzs', 'receipt_marketing', 'auto_print', 'auto_print_kitchen_check'] },
  { name: 'loyalty_cards', columns: ['id', 'card_number', 'cashback_type', 'balance', 'total_earned', 'total_redeemed', 'is_active'] },
  { name: 'loyalty_transactions', columns: ['id', 'loyalty_card_id', 'type', 'amount', 'balance_before', 'balance_after', 'cashback_percent_used', 'card_type_at_transaction', 'card_number_at_transaction', 'customer_name_at_transaction', 'phone_number_at_transaction'] },
  { name: 'expenses', columns: ['id', 'entry_type', 'expense_date', 'category', 'payment_method', 'amount', 'vendor', 'description', 'created_by_name'] },
  { name: 'bazaar_purchases', columns: ['id', 'request_key', 'expense_id', 'purchase_date', 'payment_method', 'buyer_profile_id', 'buyer_name', 'notes', 'total_amount', 'entry_source', 'created_by_name', 'created_at', 'updated_at'] },
  { name: 'bazaar_purchase_items', columns: ['id', 'purchase_id', 'product_name', 'product_key', 'category', 'quantity', 'unit', 'line_total', 'sort_order', 'notes'] },
  { name: 'bazaar_product_catalog', columns: ['product_key', 'product_name', 'category', 'unit', 'last_purchase_date', 'created_at', 'updated_at'] },
  { name: 'bazaar_purchase_audit', columns: ['id', 'purchase_id', 'action', 'old_snapshot', 'new_snapshot', 'changed_by', 'changed_by_name', 'changed_at'] },
  { name: 'daily_bazaar_telegram_deliveries', columns: ['purchase_date', 'target_key', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'updated_at'], access: 'service_only' },
  { name: 'daily_payroll_group_notification_deliveries', columns: ['business_date', 'target_key', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'updated_at'], access: 'service_only' },
  { name: 'menu_items', columns: ['id', 'external_id', 'name_uz', 'name_ru', 'name_en', 'price', 'old_price', 'sale_unit', 'grams', 'millilitres', 'kcal', 'stock_count', 'image_url', 'media_urls', 'option_groups', 'cashier_only', 'public_hidden', 'waiter_hidden', 'visible_from_time', 'visible_until_time', 'sort_order', 'deleted_at'] },
  { name: 'menu_item_costs', columns: ['menu_item_id', 'cost_price', 'variant_costs', 'updated_at'] },
  { name: 'menu_categories', columns: ['id', 'name_uz', 'name_ru', 'name_en', 'hidden', 'waiter_hidden', 'tourist_hidden', 'visible_from_time', 'visible_until_time', 'sort_order', 'deleted_at'] },
  { name: 'menu_category_user_schedule_overrides', columns: ['category_id', 'profile_id', 'created_by', 'created_at'] },
  { name: 'profiles', columns: ['id', 'role', 'full_name', 'feature_access'] },
  { name: 'employee_salary_profiles', columns: ['id', 'profile_id', 'employee_name', 'joined_at', 'ended_at', 'deleted_at', 'pay_schedule', 'payment_method', 'is_active'] },
  { name: 'employee_salary_rates', columns: ['id', 'salary_profile_id', 'effective_from', 'amount', 'rate_unit'] },
  { name: 'employee_salary_payments', columns: ['id', 'salary_profile_id', 'paid_date', 'amount', 'payment_method'] },
  { name: 'employee_salary_bonuses', columns: ['id', 'salary_profile_id', 'bonus_date', 'amount', 'payment_method', 'source_type', 'source_metadata'] },
  { name: 'employee_kpi_rules', columns: ['id', 'salary_profile_id', 'effective_from', 'rate_bps', 'is_enabled'] },
  { name: 'employee_daily_kpi_runs', columns: ['business_date', 'sales_base_amount', 'completed_at'] },
  { name: 'employee_daily_kpi_results', columns: ['id', 'business_date', 'salary_profile_id', 'rule_id', 'sales_base_amount', 'rate_bps', 'bonus_amount', 'payment_method', 'status', 'bonus_id'] },
  { name: 'employee_salary_fines', columns: ['id', 'salary_profile_id', 'fine_date', 'amount', 'reason', 'created_by_name'] },
  { name: 'employee_salary_absences', columns: ['id', 'salary_profile_id', 'absence_date'] },
  { name: 'employee_salary_telegram_links', columns: ['salary_profile_id', 'telegram_user_id', 'chat_id', 'preferred_language', 'notifications_enabled', 'linked_at'] },
  { name: 'employee_salary_notification_deliveries', columns: ['id', 'salary_profile_id', 'notification_date', 'notification_type', 'status', 'sent_at'] },
  { name: 'employee_salary_payment_notification_deliveries', columns: ['id', 'payment_id', 'salary_profile_id', 'status', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'confirmed_at', 'group_status', 'group_chat_id', 'group_telegram_message_id', 'group_error_message', 'group_attempted_at', 'group_sent_at'] },
  { name: 'telegram_notification_targets', columns: ['target_key', 'chat_id', 'language', 'is_enabled', 'updated_at'] },
  { name: 'employee_salary_group_notification_deliveries', columns: ['id', 'event_type', 'event_id', 'salary_profile_id', 'status', 'telegram_chat_id', 'telegram_message_id', 'error_message', 'attempted_at', 'sent_at', 'employee_status', 'employee_chat_id', 'employee_telegram_message_id', 'employee_error_message', 'employee_attempted_at', 'employee_sent_at', 'team_status', 'team_chat_id', 'team_telegram_message_id', 'team_error_message', 'team_attempted_at', 'team_sent_at'] },
  { name: 'accounting_record_audit', columns: ['id', 'entity_type', 'entity_id', 'action', 'old_record', 'new_record', 'changed_by', 'changed_at'] },
  { name: 'order_payment_audit', columns: ['id', 'order_id', 'action', 'changed_at'] },
  { name: 'profile_audit', columns: ['id', 'profile_id', 'action', 'changed_at'] },
]

const MIGRATION_HINTS = {
  order_payments: 'Run supabase/012_split_order_payments.sql',
  business_settings: 'Run supabase/011_business_settings.sql, supabase/073_business_settings_monthly_rent.sql, supabase/074_receipt_marketing_setting.sql, supabase/081_auto_print_kitchen_check_setting.sql, supabase/126_business_settings_monthly_utilities.sql, and supabase/130_tourist_service_rate.sql',
  table_zones: 'Run supabase/019_table_management.sql',
  loyalty_cards: 'Run supabase/022_loyalty_cashback_wallet.sql and supabase/061_loyalty_special_card.sql',
  loyalty_transactions: 'Run supabase/022_loyalty_cashback_wallet.sql, supabase/051_remove_loyalty_cards_preserve_history.sql, and supabase/061_loyalty_special_card.sql',
  expenses: 'Run supabase/048_expenses.sql and supabase/059_expense_income_entries.sql',
  profiles: 'Run supabase/064_profile_feature_access.sql or the latest supabase/097_daily_bazaar.sql',
  bazaar_purchases: 'Run supabase/097_daily_bazaar.sql',
  bazaar_purchase_items: 'Run supabase/097_daily_bazaar.sql',
  bazaar_product_catalog: 'Run supabase/097_daily_bazaar.sql',
  bazaar_purchase_audit: 'Run supabase/097_daily_bazaar.sql',
  daily_bazaar_telegram_deliveries: 'Run supabase/131_daily_bazaar_telegram_deliveries.sql',
  daily_payroll_group_notification_deliveries: 'Run supabase/134_daily_payroll_group_notifications.sql',
  order_items: 'Run supabase/070_price_modes.sql, supabase/072_order_item_selected_options.sql, supabase/098_menu_item_costs_and_profit.sql, supabase/105_menu_items_sold_by_weight.sql, and supabase/114_freeze_historical_order_prices_and_costs.sql',
  order_kitchen_rounds: 'Run supabase/128_durable_kitchen_round_receipts.sql',
  order_payment_audit: 'Run supabase/010_order_payment_audit_and_guards.sql',
  orders: 'Run supabase/075_order_actor_tracking.sql and supabase/106_atomic_paid_order_stock_deduction.sql',
  profile_audit: 'Run supabase/028_profile_role_audit.sql',
  menu_items: 'Run supabase/103_menu_item_media_gallery.sql and supabase/105_menu_items_sold_by_weight.sql',
  menu_item_costs: 'Run supabase/098_menu_item_costs_and_profit.sql and supabase/100_menu_variant_costs_and_accounting_profit.sql',
  menu_categories: 'Run supabase/053_hidden_menu_categories.sql, supabase/080_menu_category_waiter_hidden.sql, supabase/082_menu_visibility_windows.sql, supabase/115_archive_menu_catalog_deletions.sql, and supabase/133_menu_category_tourist_visibility.sql',
  menu_category_user_schedule_overrides: 'Run supabase/132_menu_category_user_schedule_overrides.sql',
  employee_salary_profiles: 'Run supabase/054_employee_salary_profiles.sql, supabase/056_employee_salary_profile_end_date.sql, supabase/060_employee_salary_manual_names.sql, and supabase/076_employee_salary_safe_delete.sql',
  employee_salary_rates: 'Run supabase/054_employee_salary_profiles.sql, supabase/055_employee_salary_rate_amount_upgrade.sql, supabase/058_employee_salary_daily_amount_compat.sql, and supabase/116_salary_rate_change_telegram_notifications.sql',
  employee_salary_payments: 'Run supabase/054_employee_salary_profiles.sql and supabase/062_drop_salary_payment_period_columns.sql',
  employee_salary_bonuses: 'Run supabase/057_employee_salary_bonuses.sql and supabase/129_daily_kpi_bonuses.sql',
  employee_kpi_rules: 'Run supabase/129_daily_kpi_bonuses.sql',
  employee_daily_kpi_runs: 'Run supabase/129_daily_kpi_bonuses.sql',
  employee_daily_kpi_results: 'Run supabase/129_daily_kpi_bonuses.sql',
  employee_salary_fines: 'Run supabase/099_employee_salary_fines.sql',
  employee_salary_absences: 'Run supabase/063_employee_salary_absences.sql',
  employee_salary_telegram_links: 'Run supabase/107_employee_salary_telegram_notifications.sql',
  employee_salary_notification_deliveries: 'Run supabase/107_employee_salary_telegram_notifications.sql',
  employee_salary_payment_notification_deliveries: 'Run supabase/108_employee_salary_payment_notification_deliveries.sql, supabase/110_salary_payment_group_notifications.sql, and supabase/113_salary_notification_attempt_tracking.sql',
  telegram_notification_targets: 'Run supabase/111_salary_group_event_notifications.sql and supabase/119_salary_event_team_notifications.sql',
  employee_salary_group_notification_deliveries: 'Run supabase/111_salary_group_event_notifications.sql, supabase/112_salary_event_employee_notifications.sql, supabase/113_salary_notification_attempt_tracking.sql, supabase/116_salary_rate_change_telegram_notifications.sql, and supabase/119_salary_event_team_notifications.sql',
  accounting_record_audit: 'Run supabase/084_accounting_record_audit.sql',
  submit_order_to_kitchen: 'Run supabase/018_submit_order_to_kitchen_rpc.sql',
  kitchen_round_receipts_version: 'Run supabase/128_durable_kitchen_round_receipts.sql completely',
  settle_loyalty_wallet_payment: 'Run supabase/027_atomic_loyalty_wallet_settlement.sql',
  settle_orders_payment: 'Run supabase/083_atomic_order_payment_settlement.sql',
  change_paid_order_payment_method_owner: 'Run supabase/090_owner_change_completed_order_payment_method.sql',
  change_paid_order_payment_methods_owner: 'Run supabase/117_owner_change_individual_payment_methods.sql',
  recall_table_from_cashier: 'Run supabase/094_admin_cashier_recall_access.sql',
  current_staff_can_view_menu_catalog: 'Run supabase/095_read_only_menu_catalog_access.sql',
  current_staff_can_access: 'Run the latest supabase/097_daily_bazaar.sql',
  current_staff_can_write: 'Run the latest supabase/097_daily_bazaar.sql',
  save_bazaar_purchase: 'Run supabase/097_daily_bazaar.sql',
  delete_bazaar_purchase: 'Run supabase/097_daily_bazaar.sql',
  create_employee_salary_telegram_link: 'Run supabase/107_employee_salary_telegram_notifications.sql',
  generate_daily_kpi_bonuses: 'Run supabase/129_daily_kpi_bonuses.sql',
  create_menu_item_with_cost: 'Run supabase/102_atomic_menu_item_cost_creation.sql',
  create_menu_item_with_media_and_cost: 'Run supabase/103_menu_item_media_gallery.sql',
  get_accounting_paid_order_summary: 'Run supabase/109_accounting_paid_order_summary.sql',
}

function missingColumnMessage(error) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`
  const schemaCacheMatch = message.match(/["']([a-z0-9_]+)["']\s+column/i)
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1]
  const qualifiedMatch = message.match(/column\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)/i)
  if (qualifiedMatch?.[1]) return qualifiedMatch[1]
  const match = message.match(/column ["']?([a-z0-9_]+)["']?/i)
  return match?.[1] || null
}

async function checkTable(dbClient, check) {
  const { error } = await dbClient
    .from(check.name)
    .select(check.columns.join(','))
    .limit(1)

  if (!error) return { type: 'table', name: check.name, ok: true, messageKey: 'ok' }

  const permissionDenied = error?.code === '42501' || /permission denied/i.test(String(error?.message || ''))
  if (check.access === 'service_only' && permissionDenied) {
    return { type: 'table', name: check.name, ok: true, messageKey: 'protected' }
  }

  const missingColumn = missingColumnMessage(error)
  return {
    type: 'table',
    name: check.name,
    ok: false,
    messageKey: missingColumn ? 'missingColumn' : 'rawError',
    detail: missingColumn || error.message,
    hint: MIGRATION_HINTS[check.name] || null,
  }
}

async function checkRpc(dbClient, name, args = { payload: {} }) {
  const { error } = await dbClient.rpc(name, args)
  if (!error) return { type: 'rpc', name, ok: true, messageKey: 'ok' }
  const message = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
  const missing = message.includes('could not find the function') ||
    message.includes('schema cache') && message.includes(name) ||
    message.includes('function') && message.includes('not found')
  return {
    type: 'rpc',
    name,
    ok: !missing,
    messageKey: missing ? 'rawError' : 'available',
    detail: missing ? error.message : null,
    hint: missing ? MIGRATION_HINTS[name] : null,
  }
}

export async function runDbHealthChecks(dbClient = supabase) {
  const startedAt = new Date().toISOString()
  const checks = await Promise.all(TABLE_CHECKS.map(check => checkTable(dbClient, check)))
  checks.push(await checkRpc(dbClient, 'submit_order_to_kitchen'))
  checks.push(await checkRpc(dbClient, 'kitchen_round_receipts_version', {}))
  checks.push(await checkRpc(dbClient, 'create_menu_item_with_cost'))
  checks.push(await checkRpc(dbClient, 'create_menu_item_with_media_and_cost'))
  checks.push(await checkRpc(dbClient, 'settle_loyalty_wallet_payment'))
  checks.push(await checkRpc(dbClient, 'settle_orders_payment'))
  checks.push(await checkRpc(dbClient, 'change_paid_order_payment_method_owner', { p_order_ids: [], p_payment_method: 'cash' }))
  checks.push(await checkRpc(dbClient, 'change_paid_order_payment_methods_owner', { p_changes: [] }))
  checks.push(await checkRpc(dbClient, 'recall_table_from_cashier', { p_table_id: '__db_health_check__' }))
  checks.push(await checkRpc(dbClient, 'current_staff_can_view_menu_catalog', {}))
  checks.push(await checkRpc(dbClient, 'current_staff_can_access', { feature_key: 'bazaar' }))
  checks.push(await checkRpc(dbClient, 'current_staff_can_write', { feature_key: 'bazaar' }))
  checks.push(await checkRpc(dbClient, 'save_bazaar_purchase'))
  checks.push(await checkRpc(dbClient, 'delete_bazaar_purchase', { p_purchase_id: '00000000-0000-0000-0000-000000000000' }))
  checks.push(await checkRpc(dbClient, 'get_accounting_paid_order_summary', {
    p_date_from: '2000-01-01',
    p_date_to: '2000-01-01',
  }))
  checks.push(await checkRpc(dbClient, 'generate_daily_kpi_bonuses', { p_business_date: null }))
  const failed = checks.filter(check => !check.ok)
  return {
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    startedAt,
    checks,
    failed,
  }
}
