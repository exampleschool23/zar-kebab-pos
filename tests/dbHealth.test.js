import test from 'node:test'
import assert from 'node:assert/strict'
import { runDbHealthChecks } from '../src/lib/dbHealth.js'

function makeClient({ missingTable = null, missingRpc = false } = {}) {
  return {
    from(name) {
      return {
        select() {
          return {
            limit() {
              if (name === missingTable) {
                return Promise.resolve({ error: { message: `relation "${name}" does not exist` } })
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
})

test('database health reports missing tables and missing RPC', async () => {
  const result = await runDbHealthChecks(makeClient({ missingTable: 'order_payments', missingRpc: true }))
  assert.equal(result.ok, false)
  assert.deepEqual(result.failed.map(check => check.name).sort(), ['order_payments', 'submit_order_to_kitchen'])
})
