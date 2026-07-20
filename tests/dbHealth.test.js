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

  const missingSnapshot = await runDbHealthChecks(makeClient({
    missingColumnTable: 'order_items',
    missingColumn: 'cost_price',
  }))
  assert.equal(missingSnapshot.ok, false)
  assert.equal(missingSnapshot.failed.find(check => check.name === 'order_items').detail, 'cost_price')
})

test('database health reports missing tables and missing RPC', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'order_payments', missingRpc: true }))
  assert.equal(result.ok, false)
  assert.deepEqual(result.failed.map(check => check.name).sort(), [
    'change_paid_order_payment_method_owner',
    'current_staff_can_access',
    'current_staff_can_view_menu_catalog',
    'current_staff_can_write',
    'delete_bazaar_purchase',
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
  assert.match(result.failed.find(check => check.name === 'recall_table_from_cashier').hint, /094_admin_cashier_recall_access/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_view_menu_catalog').hint, /095_read_only_menu_catalog_access/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_access').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'current_staff_can_write').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'save_bazaar_purchase').hint, /097_daily_bazaar/)
  assert.match(result.failed.find(check => check.name === 'delete_bazaar_purchase').hint, /097_daily_bazaar/)
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
