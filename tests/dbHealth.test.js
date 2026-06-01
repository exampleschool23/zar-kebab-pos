import test from 'node:test'
import assert from 'node:assert/strict'
import { runDbHealthChecks } from '../src/lib/dbHealth.js'

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

test('database health reports missing tables and missing RPC', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'order_payments', missingRpc: true }))
  assert.equal(result.ok, false)
  assert.deepEqual(result.failed.map(check => check.name).sort(), [
    'order_payments',
    'settle_loyalty_wallet_payment',
    'submit_order_to_kitchen',
  ])
  assert.equal(result.failed.find(check => check.name === 'order_payments').messageKey, 'rawError')
  assert.match(result.failed.find(check => check.name === 'settle_loyalty_wallet_payment').hint, /027_atomic_loyalty_wallet_settlement/)
})
