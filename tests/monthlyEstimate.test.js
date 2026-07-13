import test from 'node:test'
import assert from 'node:assert/strict'

import { getMonthlyEstimateMethodRows } from '../src/lib/monthlyEstimate.js'

function paidOrder(overrides = {}) {
  return {
    id: overrides.id || 'paid-order',
    status: 'paid',
    payment_status: 'paid',
    service_rate_pct: 0,
    loyalty_used_amount: 30000,
    items: [{ menu_item_id: 'kebab', quantity: 1, price: 100000, status: 'served' }],
    payments: [{ method: 'cash', amount: 70000 }],
    ...overrides,
  }
}

test('monthly estimate reconciles loyalty wallet inflow missing from stored split rows', () => {
  const rows = getMonthlyEstimateMethodRows(
    [paidOrder()],
    [{ entry_type: 'income', payment_method: 'card', amount: 20000 }],
    [{ payment_method: 'cash', amount: 10000 }]
  )

  assert.deepEqual(rows, [
    { method: 'cash', inflow: 70000, outflow: 10000 },
    { method: 'card', inflow: 20000, outflow: 0 },
    { method: 'loyalty_card', inflow: 30000, outflow: 0 },
  ])
  assert.equal(rows.reduce((sum, row) => sum + row.inflow, 0), 120000)
})

test('monthly estimate does not duplicate loyalty already present in payment rows', () => {
  const rows = getMonthlyEstimateMethodRows([
    paidOrder({
      payments: [
        { method: 'cash', amount: 70000 },
        { method: 'loyalty_card', amount: 30000 },
      ],
    }),
  ])

  assert.deepEqual(rows, [
    { method: 'cash', inflow: 70000, outflow: 0 },
    { method: 'loyalty_card', inflow: 30000, outflow: 0 },
  ])
  assert.equal(rows.reduce((sum, row) => sum + row.inflow, 0), 100000)
})
