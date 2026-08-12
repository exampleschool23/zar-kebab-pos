import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('successful Staff Access submits the reviewed guest cart before returning to tables', () => {
  const orderSource = fs.readFileSync(new URL('../src/pages/WaiterOrder.jsx', import.meta.url), 'utf8')
  const unlockStart = orderSource.indexOf('async function unlockGuestMode(pin)')
  const unlockEnd = orderSource.indexOf('\n  function handleSignOut()', unlockStart)
  const unlockSource = orderSource.slice(unlockStart, unlockEnd)

  const submitAt = unlockSource.indexOf("type: 'SEND_TO_KITCHEN'")
  const clearAt = unlockSource.indexOf('clearGuestModeSession()')
  const navigateAt = unlockSource.indexOf("navigate('/waiter/tables', { replace: true })")
  assert.ok(submitAt > 0)
  assert.ok(clearAt > submitAt)
  assert.ok(navigateAt > clearAt)
  assert.match(unlockSource, /_cart: reviewedCart/)
  assert.match(unlockSource, /if \(submitResult\?\.error\)/)
})

test('Guest submission can use the reviewed cart snapshot before React state catches up', () => {
  const contextSource = fs.readFileSync(new URL('../src/store/AppContext.jsx', import.meta.url), 'utf8')
  const dbSource = fs.readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')

  assert.match(contextSource, /Array\.isArray\(action\._cart\) \? action\._cart : stateRef\.current\.cart/)
  assert.match(dbSource, /if \(\(!isOffPremise && !table\) \|\| items\.length === 0\) return/)
})

test('automatic matching PIN submission remains guarded from duplicate requests', () => {
  const dialogSource = fs.readFileSync(new URL('../src/components/GuestModeUI.jsx', import.meta.url), 'utf8')
  const tablesSource = fs.readFileSync(new URL('../src/pages/WaiterTables.jsx', import.meta.url), 'utf8')

  assert.match(dialogSource, /submitRequestRef\.current/)
  assert.match(tablesSource, /guestEntryRequestRef\.current/)
})
