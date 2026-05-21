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
]

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
  }
}

async function checkKitchenRpc(dbClient) {
  const { error } = await dbClient.rpc('submit_order_to_kitchen', { payload: {} })
  if (!error) return { type: 'rpc', name: 'submit_order_to_kitchen', ok: true, messageKey: 'ok' }
  const message = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
  const missing = message.includes('could not find the function') ||
    message.includes('schema cache') && message.includes('submit_order_to_kitchen') ||
    message.includes('function') && message.includes('not found')
  return {
    type: 'rpc',
    name: 'submit_order_to_kitchen',
    ok: !missing,
    messageKey: missing ? 'rawError' : 'available',
    detail: missing ? error.message : null,
  }
}

export async function runDbHealthChecks(dbClient = supabase) {
  const startedAt = new Date().toISOString()
  const checks = await Promise.all(TABLE_CHECKS.map(check => checkTable(dbClient, check)))
  checks.push(await checkKitchenRpc(dbClient))
  const failed = checks.filter(check => !check.ok)
  return {
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    startedAt,
    checks,
    failed,
  }
}
