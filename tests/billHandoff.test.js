import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cancelBillPrintWindow,
  completeBillHandoff,
  completeBillPrint,
  getBillReceiptPath,
  prepareBillPrintWindow,
} from '../src/lib/billHandoff.js'

test('bill handoff opens a printable receipt and navigates the current page to cashier', () => {
  const replaced = []
  const printWindow = {
    closed: false,
    location: { replace: path => replaced.push(path) },
  }
  const browserWindow = { open: () => printWindow }
  const navigated = []

  const prepared = prepareBillPrintWindow(true, browserWindow)
  completeBillHandoff({
    navigate: path => navigated.push(path),
    tableId: 'table 2',
    autoPrint: true,
    printWindow: prepared,
    browserWindow,
  })

  assert.deepEqual(navigated, ['/cashier/bill/table%202'])
  assert.deepEqual(replaced, ['/receipt/table/table%202?print=1'])
})

test('bill handoff navigates to cashier without opening a receipt when auto-print is off', () => {
  let openCount = 0
  const browserWindow = { open: () => { openCount += 1; return null } }
  const navigated = []

  assert.equal(prepareBillPrintWindow(false, browserWindow), null)
  completeBillHandoff({
    navigate: path => navigated.push(path),
    tableId: 't1',
    autoPrint: false,
    printWindow: null,
    browserWindow,
  })

  assert.deepEqual(navigated, ['/cashier/bill/t1'])
  assert.equal(openCount, 0)
})

test('failed bill handoff closes its reserved print window', () => {
  let closed = false
  cancelBillPrintWindow({ closed: false, close: () => { closed = true } })
  assert.equal(closed, true)
})

test('cashier print uses the reserved table-flow window for table and order receipts', () => {
  const replaced = []
  const printWindow = {
    closed: false,
    location: { replace: path => replaced.push(path) },
  }
  const navigated = []

  completeBillPrint({
    navigate: path => navigated.push(path),
    orderId: 'take away/2',
    printWindow,
  })

  assert.deepEqual(replaced, ['/receipt/take%20away%2F2?print=1'])
  assert.deepEqual(navigated, [])
  assert.equal(getBillReceiptPath({ tableId: 'table 2' }), '/receipt/table/table%202?print=1')
})

test('cashier print falls back to the current receipt route when a popup is blocked', () => {
  const navigated = []

  completeBillPrint({
    navigate: path => navigated.push(path),
    tableId: 't1',
    printWindow: null,
  })

  assert.deepEqual(navigated, ['/receipt/table/t1?print=1'])
})
