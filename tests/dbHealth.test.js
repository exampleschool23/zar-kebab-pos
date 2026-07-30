import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runDbHealthChecks } from '../src/lib/dbHealth.js'

const cliHealthSource = readFileSync(new URL('../scripts/check-db-health.js', import.meta.url), 'utf8')

function makeClient({ missingTable = null, missingColumnTable = null, missingColumn = null, missingRpc = false } = {}) {
  return {
    from(name) {
      return {
        select(columns) {
          return {
            limit() {
              if (name === missingTable) {
                return Promise.resolve({ error: { message: `relation "${name}" does not exist` } })
              }
              if (name === missingColumnTable && columns?.includes(missingColumn)) {
                return Promise.resolve({
                  error: {
                    message: `column ${name}.${missingColumn} does not exist`,
                  },
                })
              }
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
      }
    },
    rpc(name) {
      if (missingRpc) {
        return Promise.resolve({ error: { message: `Could not find the function public.${name}` } })
      }
      return Promise.resolve({ error: { message: 'order id is required' } })
    },
  }
}

test('database health passes when tables exist and RPC responds with a validation error', async () => {
  const result = await runDbHealthChecks(makeClient())
  assert.equal(result.ok, true)
  assert.equal(result.failed.length, 0)
  assert.equal(result.checks.some(check => check.name === 'submit_order_to_kitchen' && check.ok), true)
  assert.equal(result.checks.find(check => check.name === 'restaurant_tables').messageKey, 'ok')
  assert.equal(result.checks.find(check => check.name === 'submit_order_to_kitchen').messageKey, 'available')
})

test('database health reports the actual missing schema-cache column', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'loyalty_cards',
    missingColumn: 'cashback_type',
  }))

  const failed = result.failed.find(check => check.name === 'loyalty_cards')
  assert.equal(result.ok, false)
  assert.equal(failed.messageKey, 'missingColumn')
  assert.equal(failed.detail, 'cashback_type')
})

test('database health catches a profiles table missing feature access', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'profiles',
    missingColumn: 'feature_access',
  }))

  const failed = result.failed.find(check => check.name === 'profiles')
  assert.equal(result.ok, false)
  assert.equal(failed.detail, 'feature_access')
  assert.match(failed.hint, /097_daily_bazaar/)
})

test('database health requires private menu costs and order cost snapshots', async () => {
  const missingCosts = await runDbHealthChecks(makeClient({ missingTable: 'menu_item_costs' }))
  assert.equal(missingCosts.ok, false)
  assert.match(missingCosts.failed.find(check => check.name === 'menu_item_costs').hint, /098_menu_item_costs_and_profit/)
  assert.match(missingCosts.failed.find(check => check.name === 'menu_item_costs').hint, /100_menu_variant_costs_and_accounting_profit/)

  const missingSnapshot = await runDbHealthChecks(makeClient({
    missingColumnTable: 'order_items',
    missingColumn: 'cost_price',
  }))
  assert.equal(missingSnapshot.ok, false)
  assert.equal(missingSnapshot.failed.find(check => check.name === 'order_items').detail, 'cost_price')
})

test('database health requires the employee salary fines migration', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'employee_salary_fines' }))

  assert.equal(result.ok, false)
  assert.match(result.failed.find(check => check.name === 'employee_salary_fines').hint, /099_employee_salary_fines/)
  assert.match(cliHealthSource, /checkTable\('employee_salary_fines'/)
})

test('database health requires auditable salary payment notifications', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingTable: 'employee_salary_payment_notification_deliveries',
  }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'employee_salary_payment_notification_deliveries').hint,
    /108_employee_salary_payment_notification_deliveries/
  )
  assert.match(
    result.failed.find(check => check.name === 'employee_salary_payment_notification_deliveries').hint,
    /110_salary_payment_group_notifications/
  )
  assert.match(cliHealthSource, /checkTable\('employee_salary_payment_notification_deliveries'/)
})

test('database health reports missing tables and missing RPC', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'order_payments', missingRpc: true }))
  assert.equal(result.ok, false)
  assert.deepEqual(result.failed.map(check => check.name).sort(), [
    'change_paid_order_payment_method_owner',
    'create_menu_item_with_cost',
    'create_menu_item_with_media_and_cost',
    'create_telegram_order',
    'current_staff_can_access',
    'current_staff_can_view_menu_catalog',
    'current_staff_can_write',
    'delete_bazaar_purchase',
    'get_accounting_paid_order_summary',
    'order_payments',
    'recall_table_from_cashier',
    'save_bazaar_purchase',
    'settle_loyalty_wallet_payment',
    'settle_orders_payment',
    'submit_order_to_kitchen',
  ])
  assert.equal(result.failed.find(check => check.name === 'order_payments').messageKey, 'rawError')
  assert.match(result.failed.find(check => check.name === 'settle_loyalty_wallet_payment').hint, /027_atomic_loyalty_wallet_settlement/)
  assert.match(result.failed.find(check => check.name === 'settle_orders_payment').hint, /083_atomic_order_payment_settlement/)
  assert.match(result.failed.find(check => check.name === 'change_paid_order_payment_method_owner').hint, /090_owner_change_completed_order_payment_method/)
  assert.match(result.failed.find(check => check.name === 'create_telegram_order').hint, /101_atomic_telegram_orders/)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_cost').hint, /102_atomic_menu_item_cost_creation/)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_media_and_cost').hint, /103_menu_item_media_gallery/)
  assert.match(result.failed.find(check => check.name === 'recall_table_from_cashier').hint, /094_admin_cashier_recall_access/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_view_menu_catalog').hint, /095_read_only_menu_catalog_access/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_access').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_write').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'save_bazaar_purchase').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'delete_bazaar_purchase').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'get_accounting_paid_order_summary').hint, /109_accounting_paid_order_summary/)
})

test('database health requires the lightweight Accounting summary RPC', async () => {
  const result = await runDbHealthChecks(makeClient({ missingRpc: true }))

  assert.equal(result.ok, false)
  assert.match(
    result.failed.find(check => check.name === 'get_accounting_paid_order_summary').hint,
    /109_accounting_paid_order_summary/
  )
  assert.match(cliHealthSource, /get_accounting_paid_order_summary\(p_date_from,p_date_to\)/)
  assert.match(cliHealthSource, /p_date_from: '2000-01-01'/)
  assert.match(cliHealthSource, /p_date_to: '2000-01-01'/)
})

test('daily Bazaar schema and RPC checks are required in the CLI health command', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'bazaar_product_catalog' }))
  assert.equal(result.ok, false)
  assert.match(result.failed.find(check => check.name === 'bazaar_product_catalog').hint, /097_daily_bazaar/)

  assert.match(cliHealthSource, /checkTable\('bazaar_purchases',[^\n]+\),/)
  assert.match(cliHealthSource, /checkTable\('bazaar_product_catalog',[^\n]+\),/)
  assert.match(cliHealthSource, /checkTable\('profiles', 'id, role, status, full_name, email, feature_access'\)/)
  assert.match(cliHealthSource, /current_staff_can_access\(feature_key\)/)
  assert.match(cliHealthSource, /current_staff_can_write\(feature_key\)/)
  assert.doesNotMatch(cliHealthSource, /checkTable\('bazaar_(?:purchases|purchase_items|product_catalog|purchase_audit)'[^\n]+false\)/)
  assert.doesNotMatch(cliHealthSource, /save_bazaar_purchase[\s\S]{0,220}'bazaar write access is required',\s*false/)
  assert.doesNotMatch(cliHealthSource, /delete_bazaar_purchase[\s\S]{0,240}'bazaar write access is required',\s*false/)
})

test('atomic menu creation and media gallery RPCs are required by both health checks', async () => {
  const result = await runDbHealthChecks(makeClient({ missingRpc: true }))

  assert.equal(result.ok, false)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_cost').hint, /102_atomic_menu_item_cost_creation/)
  assert.match(result.failed.find(check => check.name === 'create_menu_item_with_media_and_cost').hint, /103_menu_item_media_gallery/)
  assert.match(cliHealthSource, /create_menu_item_with_cost\(payload\)/)
  assert.match(cliHealthSource, /supabase\.rpc\('create_menu_item_with_cost', \{ payload: \{\} \}\)/)
  assert.match(cliHealthSource, /create_menu_item_with_media_and_cost\(payload\)/)
  assert.match(cliHealthSource, /supabase\.rpc\('create_menu_item_with_media_and_cost', \{ payload: \{\} \}\)/)
})

test('database health requires the menu media gallery column', async () => {
  const result = await runDbHealthChecks(makeClient({
    missingColumnTable: 'menu_items',
    missingColumn: 'media_urls',
  }))

  assert.equal(result.ok, false)
  const failed = result.failed.find(check => check.name === 'menu_items')
  assert.equal(failed.detail, 'media_urls')
  assert.match(failed.hint, /103_menu_item_media_gallery/)
  assert.match(cliHealthSource, /menu_items', '[^']*media_urls/)
})
