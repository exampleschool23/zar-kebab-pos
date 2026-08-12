import assert from 'node:assert/strict'
import test from 'node:test'

import { cartReducer } from '../src/store/cartReducer.js'
import {
  GUEST_MODE_PIN_LENGTH,
  GUEST_MODE_MAX_PIN_ATTEMPTS,
  GUEST_MODE_STORAGE_KEY,
  LEGACY_GUEST_MODE_PIN_LENGTH,
  clearGuestModeSession,
  createGuestModeSession,
  getGuestModeLockState,
  getGuestModePinLength,
  getGuestModeTabId,
  guestModePinLockSeconds,
  isGuestModeOwnedByCurrentTab,
  isGuestModeSessionFor,
  normalizeGuestModePin,
  readGuestModeSession,
  registerGuestModePinFailure,
  updateGuestModeSession,
  verifyGuestModePin,
  writeGuestModeSession,
} from '../src/lib/guestMode.js'

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }

  removeItem(key) {
    this.values.delete(key)
  }
}

test('guest handoff PIN keeps leading zeroes and stores only a salted digest', async () => {
  assert.equal(GUEST_MODE_PIN_LENGTH, 2)
  assert.equal(normalizeGuestModePin('a01-23x9'), '01')

  const first = await createGuestModeSession({
    tableId: 'terrace-1',
    staffUserId: 'staff-1',
    pin: '01',
    guestLang: 'en',
  })
  const second = await createGuestModeSession({
    tableId: 'terrace-1',
    staffUserId: 'staff-1',
    pin: '01',
  })

  assert.equal(first.pin, undefined)
  assert.equal(first.pinLength, 2)
  assert.equal(first.priceMode, 'tourist')
  assert.notEqual(first.pinSalt, second.pinSalt)
  assert.notEqual(first.pinDigest, second.pinDigest)
  assert.equal(await verifyGuestModePin(first, '01'), true)
  assert.equal(await verifyGuestModePin(first, '12'), false)
  assert.equal(await verifyGuestModePin(first, '1'), false)
  assert.equal(await verifyGuestModePin(first, '012'), false)
  await assert.rejects(() => createGuestModeSession({
    tableId: 'terrace-1',
    staffUserId: 'staff-1',
    pin: '01',
    priceMode: 'invalid',
  }), /R or T pricing/)
})

test('a stored four-digit Guest lock remains unlockable after new locks switch to two digits', async () => {
  const legacySession = await createGuestModeSession({
    tableId: 'legacy-table',
    staffUserId: 'staff-1',
    pin: '0123',
    pinLength: LEGACY_GUEST_MODE_PIN_LENGTH,
  })
  delete legacySession.pinLength

  assert.equal(getGuestModePinLength(legacySession), 4)
  assert.equal(await verifyGuestModePin(legacySession, '0123'), true)
  assert.equal(await verifyGuestModePin(legacySession, '01'), false)
})

test('guest mode persists its exact table, language, cart, and finished state for reload recovery', async () => {
  const storage = new MemoryStorage()
  const session = await createGuestModeSession({
    tableId: 'table/7',
    staffUserId: 'staff-7',
    pin: '40',
    priceMode: 'regular',
    guestLang: 'ru',
    cart: [{ menu_item_id: 'meal-1', quantity: 2, base_price: 10_000 }],
    activeOrderIds: ['order-b', 'order-a', 'order-a'],
  })

  writeGuestModeSession(session, storage)
  const restored = readGuestModeSession(storage)
  assert.equal(restored.tableId, 'table/7')
  assert.equal(restored.routePath, '/waiter/order/table%2F7')
  assert.equal(restored.guestLang, 'ru')
  assert.equal(restored.priceMode, 'regular')
  assert.deepEqual(restored.cart, session.cart)
  assert.deepEqual(restored.activeOrderIds, ['order-a', 'order-b'])
  assert.equal(isGuestModeSessionFor(restored, {
    tableId: 'table/7',
    staffUserId: 'staff-7',
    pathname: '/waiter/order/table%2F7',
  }), true)
  assert.equal(isGuestModeSessionFor(restored, { tableId: 'another-table' }), false)
  assert.equal(isGuestModeSessionFor({ ...restored, routePath: '/waiter/order/another-table' }), false)

  updateGuestModeSession({ finished: true, guestLang: 'en' }, storage)
  assert.equal(readGuestModeSession(storage).finished, true)
  assert.equal(readGuestModeSession(storage).guestLang, 'en')

  const legacySession = { ...session }
  delete legacySession.priceMode
  storage.setItem(GUEST_MODE_STORAGE_KEY, JSON.stringify(legacySession))
  assert.equal(readGuestModeSession(storage).priceMode, 'tourist')

  clearGuestModeSession(storage)
  assert.equal(readGuestModeSession(storage), null)
})

test('guest route lock fails closed when staff identity or Tables access changes', async () => {
  const session = await createGuestModeSession({
    tableId: 'terrace-1',
    staffUserId: 'staff-1',
    pin: '12',
  })
  const active = {
    authenticatedUserId: 'staff-1',
    profileUserId: 'staff-1',
    profileStatus: 'active',
    canViewTables: true,
  }

  assert.equal(getGuestModeLockState(session, active), 'active')
  assert.equal(getGuestModeLockState(session, { ...active, authenticatedUserId: 'staff-2' }), 'recovery')
  assert.equal(getGuestModeLockState(session, { ...active, profileUserId: 'staff-2' }), 'recovery')
  assert.equal(getGuestModeLockState(session, { ...active, canViewTables: false }), 'recovery')
  assert.equal(getGuestModeLockState(session, { ...active, profileStatus: 'disabled' }), 'recovery')
  assert.equal(getGuestModeLockState(session, { ...active, ownsGuestModeSession: false }), 'recovery')
  assert.equal(getGuestModeLockState(session, { ...active, authenticatedUserId: '' }), 'signed_out')
})

test('guest lock is device-wide while only the handoff tab owns the live cart', async () => {
  const handoffTab = new MemoryStorage()
  const otherTab = new MemoryStorage()
  const session = await createGuestModeSession({
    tableId: 'terrace-1',
    staffUserId: 'staff-1',
    pin: '12',
    ownerTabId: getGuestModeTabId(handoffTab),
  })

  assert.equal(isGuestModeOwnedByCurrentTab(session, handoffTab), true)
  assert.equal(isGuestModeOwnedByCurrentTab(session, otherTab), false)
  assert.equal(getGuestModeLockState(session, {
    authenticatedUserId: 'staff-1',
    profileUserId: 'staff-1',
    profileStatus: 'active',
    canViewTables: true,
    ownsGuestModeSession: false,
  }), 'recovery')
})

test('wrong guest PIN attempts trigger a reload-persistent timeout', async () => {
  const now = 1_000_000
  let session = await createGuestModeSession({
    tableId: 't1',
    staffUserId: 'staff-1',
    pin: '00',
  })

  for (let attempt = 0; attempt < GUEST_MODE_MAX_PIN_ATTEMPTS; attempt += 1) {
    session = registerGuestModePinFailure(session, now)
  }

  assert.equal(session.failedAttempts, 0)
  assert.equal(guestModePinLockSeconds(session, now), 30)
  assert.equal(guestModePinLockSeconds(session, now + 29_001), 1)
  assert.equal(guestModePinLockSeconds(session, now + 30_000), 0)
})

test('guest cart replacement restores one scoped draft without merging previous cart rows', () => {
  const state = {
    cart: [{ menu_item_id: 'old', quantity: 1 }],
  }
  const next = cartReducer(state, {
    type: 'REPLACE_CART',
    payload: [{ menu_item_id: 'guest-meal', quantity: 3 }],
  })

  assert.deepEqual(next.cart, [{ menu_item_id: 'guest-meal', quantity: 3 }])
  assert.notEqual(next.cart, state.cart)
})
