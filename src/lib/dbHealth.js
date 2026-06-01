import { supabase } from './supabase.js'

const TABLE_CHECKS = [
  { name: 'restaurant_tables', columns: ['id', 'name', 'status', 'capacity', 'sort_order', 'is_active', 'reserved_at'] },
  { name: 'table_zones', columns: ['id', 'name', 'sort_order', 'is_active'] },
  { name: 'orders', columns: ['id', 'table_id', 'status', 'payment_status', 'total', 'service_rate_pct', 'loyalty_card_number', 'loyalty_used_amount', 'cashback_earned'] },
  { name: 'order_items', columns: ['id', 'order_id', 'menu_item_id', 'status', 'quantity'] },
  { name: 'order_payments', columns: ['id', 'order_id', 'method', 'amount'] },
  { name: 'business_settings', columns: ['id', 'service_rate_pct', 'restaurant_name'] },
  { name: 'loyalty_cards', columns: ['id', 'card_number', 'cashback_type', 'balance', 'total_earned', 'total_redeemed', 'is_active'] },
  { name: 'loyalty_transactions', columns: ['id', 'loyalty_card_id', 'type', 'amount', 'balance_before', 'balance_after', 'cashback_percent_used', 'card_type_at_transaction'] },
  { name: 'menu_items', columns: ['id', 'name_uz', 'name_ru', 'name_en', 'price', 'sort_order'] },
  { name: 'menu_categories', columns: ['id', 'name_uz', 'name_ru', 'name_en', 'sort_order'] },
  { name: 'profiles', columns: ['id', 'role', 'full_name'] },
  { name: 'order_payment_audit', columns: ['id', 'order_id', 'action', 'changed_at'] },
  { name: 'profile_audit', columns: ['id', 'profile_id', 'action', 'changed_at'] },
]

const MIGRATION_HINTS = {
  order_payments: 'Run supabase/012_split_order_payments.sql',
  business_settings: 'Run supabase/011_business_settings.sql',
  table_zones: 'Run supabase/019_table_management.sql',
  loyalty_cards: 'Run supabase/022_loyalty_cashback_wallet.sql',
  loyalty_transactions: 'Run supabase/022_loyalty_cashback_wallet.sql',
  order_payment_audit: 'Run supabase/010_order_payment_audit_and_guards.sql',
  profile_audit: 'Run supabase/028_profile_role_audit.sql',
  submit_order_to_kitchen: 'Run supabase/018_submit_order_to_kitchen_rpc.sql',
  settle_loyalty_wallet_payment: 'Run supabase/027_atomic_loyalty_wallet_settlement.sql',
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

async function checkRpc(dbClient, name) {
  const { error } = await dbClient.rpc(name, { payload: {} })
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
  checks.push(await checkRpc(dbClient, 'settle_loyalty_wallet_payment'))
  const failed = checks.filter(check => !check.ok)
  return {
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    startedAt,
    checks,
    failed,
  }
}
