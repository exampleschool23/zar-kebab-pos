import test from 'node:test'
import assert from 'node:assert/strict'

import {
  completeBillHandoff,
  getBillReceiptPath,
} from '../src/lib/billHandoff.js'

test('auto-print bill handoff stays in the current page and requests its receipt dialog', () => {
  const navigated = []

  completeBillHandoff({
    navigate: path => navigated.push(path),
    tableId: 'table 2',
    autoPrint: true,
  })

  assert.deepEqual(navigated, ['/cashier/bill/table%202?print=1'])
})

test('bill handoff navigates to cashier without a print request when auto-print is off', () => {
  const navigated = []

  completeBillHandoff({
    navigate: path => navigated.push(path),
    tableId: 't1',
    autoPrint: false,
  })

  assert.deepEqual(navigated, ['/cashier/bill/t1'])
})

test('receipt paths support table and off-premise order bills', () => {
  assert.equal(getBillReceiptPath({ tableId: 'table 2' }), '/receipt/table/table%202?print=1')
  assert.equal(getBillReceiptPath({ orderId: 'take away/2' }), '/receipt/take%20away%2F2?print=1')
})

test('waiter cannot implicitly recall a requested bill, while cashier and ordinary rounds remain allowed', async () => {
  const { getKitchenBillBlockError } = await import('../src/lib/billHandoff.js')
  const waiter = { role: 'admin', feature_access: ['tables'], status: 'active' }
  const cashier = { ...waiter, feature_access: ['tables', 'cashier'] }
  const order = { status: 'needs_bill', payment_status: 'unpaid' }
  assert.equal(getKitchenBillBlockError(order, waiter)?.code, 'POS_BILL_WITH_CASHIER')
  assert.equal(getKitchenBillBlockError(order, cashier), null)
  assert.equal(getKitchenBillBlockError({ ...order, status: 'sent_to_kitchen' }, waiter), null)
  assert.equal(getKitchenBillBlockError({ ...order, payment_status: 'paid' }, waiter), null)
  assert.equal(getKitchenBillBlockError(null, waiter), null)
})

test('blocked fresh submission preserves cart and does not persist a retry; pending retries bypass preflight', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../src/store/AppContext.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('      const pendingAttempt = pendingKitchenSubmissionRef.current')
  const end = source.indexOf('        const priceMode =', start)
  const preflight = new Function('stateRef', 'pendingKitchenSubmissionRef', 'action', 'dispatch', 'normalizeOrderType', 'isOffPremiseOrderType', 'getKitchenBillBlockError', 'getActiveTableOrders', `let enriched; let reusedPendingKitchenSubmission; ${source.slice(start, end)} } return { enriched, reusedPendingKitchenSubmission };`)
  const { getKitchenBillBlockError } = await import('../src/lib/billHandoff.js')
  const { getActiveTableOrders } = await import('../src/lib/tableGuestEntry.js')
  const state = { orders: [{ id: 'o1', table_id: 't1', status: 'needs_bill', payment_status: 'unpaid', items: [{ price: 10000, quantity: 1 }] }], currentTableId: 't1', user: { role: 'admin', feature_access: ['tables'] }, cart: [{ id: 'dish1', quantity: 2 }] }
  const original = structuredClone(state)
  const notices = []
  const run = pending => preflight({ current: state }, { current: pending }, { type: 'SEND_TO_KITCHEN', payload: { orderType: 'dine_in' } }, action => notices.push(action), value => value, type => type !== 'dine_in', getKitchenBillBlockError, getActiveTableOrders)
  assert.equal((await run(null)).error.code, 'POS_BILL_WITH_CASHIER')
  assert.deepEqual(state, original)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].type, 'SET_CONNECTION_NOTICE')
  const pending = { _orderId: 'o1', _kitchenRoundId: 'same-round' }
  assert.deepEqual(run(pending), { enriched: { ...pending, _kitchenSubmissionRetry: true }, reusedPendingKitchenSubmission: true })
  state.orders[0].items = []
  state.orders[0].total = 41400
  assert.equal(run(null).enriched, undefined, 'an empty old bill must not block a fresh order')
  assert.equal(notices.length, 1)
})
