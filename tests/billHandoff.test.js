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
