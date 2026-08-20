import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('off-premise order buttons and route require the dedicated user feature', () => {
  const app = readSource('src/App.jsx')
  const waiterTables = readSource('src/pages/WaiterTables.jsx')

  assert.match(
    app,
    /path="\/waiter\/take-away"[\s\S]*?<LazyProtectedRoute page="off_premise_orders">/
  )
  assert.match(waiterTables, /canUseOffPremiseOrders/)
  assert.match(waiterTables, /\{canCreateOffPremiseOrders && \(/)
  assert.match(waiterTables, /if \(!canCreateOffPremiseOrders\) return/g)
})

test('off-premise submission is permission-checked at the database boundary', () => {
  const migration = readSource('supabase/138_off_premise_order_access.sql')

  assert.match(migration, /'off_premise_orders', 'delete_paid_orders'/)
  assert.match(migration, /not \('off_premise_orders' = any\(feature_access\)\)[\s\S]*?'tables' = any\(feature_access\)/)
  assert.match(migration, /target_order_type in \('take_away', 'delivery'\)/)
  assert.match(migration, /submitted_item ->> 'order_type' in \('take_away', 'delivery'\)/)
  assert.match(migration, /current_staff_can_write\('off_premise_orders'\)/)
  assert.match(migration, /perform public\.submit_order_to_kitchen_unchecked\(payload\)/)
})
