import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { loadAccountingPaidOrderSummary } from '../src/lib/accountingSummary.js'

const migration = readFileSync(
  new URL('../supabase/109_accounting_paid_order_summary.sql', import.meta.url),
  'utf8'
)

test('Accounting summary loader uses one RPC and returns no complete order rows', async () => {
  const calls = []
  const expected = {
    cafe_income: 1_500,
    loyalty_income: 200,
    cost_total: 400,
    payment_method_income: { cash: 800, card: 700 },
  }
  const dbClient = {
    rpc(name, args) {
      calls.push({ name, args })
      return Promise.resolve({ data: expected, error: null })
    },
    from() {
      throw new Error('Complete order fallback must not run when the RPC exists')
    },
  }

  const result = await loadAccountingPaidOrderSummary('2026-07-01', '2026-07-14', { dbClient })

  assert.deepEqual(result, expected)
  assert.deepEqual(calls, [{
    name: 'get_accounting_paid_order_summary',
    args: {
      p_date_from: '2026-07-01',
      p_date_to: '2026-07-14',
    },
  }])
})

test('Accounting summary migration aggregates protected financial fields with permission checks', () => {
  assert.match(migration, /create or replace function public\.get_accounting_paid_order_summary/)
  assert.match(migration, /current_staff_can_access\('expenses'\)/)
  assert.match(migration, /orders\.paid_at >= from_instant/)
  assert.match(migration, /orders\.paid_at < to_instant_exclusive/)
  assert.match(migration, /join paid_orders[\s\S]*sold_item\.order_id/)
  assert.match(migration, /sold_item\.cost_price::numeric/)
  assert.match(migration, /current_cost\.variant_costs/)
  assert.match(migration, /public\.order_payments/)
  assert.match(migration, /'payment_method_income'/)
  assert.match(migration, /grant execute on function public\.get_accounting_paid_order_summary\(date, date\)/)
})
