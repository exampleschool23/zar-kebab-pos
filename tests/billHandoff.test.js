import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cancelBillPrintWindow,
  completeBillHandoff,
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
