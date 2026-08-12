import { PRICE_MODE_REGULAR, PRICE_MODE_TOURIST } from './priceModes.js'

export const GUEST_MODE_STORAGE_KEY = 'zk_tablet_guest_mode_v1'
export const GUEST_MODE_CHANGE_EVENT = 'zk:tablet-guest-mode-change'
export const GUEST_MODE_TAB_KEY = 'zk_tablet_guest_mode_tab_v1'
export const GUEST_MODE_PIN_LENGTH = 2
export const LEGACY_GUEST_MODE_PIN_LENGTH = 4
export const GUEST_MODE_MAX_PIN_ATTEMPTS = 5
export const GUEST_MODE_PIN_LOCK_MS = 30_000

const GUEST_MODE_VERSION = 1
const PBKDF2_ITERATIONS = 120_000
const VALID_LANGS = new Set(['uz', 'ru', 'en'])
let fallbackTabId = ''

export function normalizeGuestModePriceMode(value) {
  return value === PRICE_MODE_REGULAR ? PRICE_MODE_REGULAR : PRICE_MODE_TOURIST
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

function defaultTabStorage() {
  try {
    return globalThis.sessionStorage || null
  } catch {
    return null
  }
}

export function getGuestModeTabId(storage = defaultTabStorage()) {
  try {
    const saved = String(storage?.getItem(GUEST_MODE_TAB_KEY) || '').trim()
    if (saved) return saved
    const created = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    storage?.setItem(GUEST_MODE_TAB_KEY, created)
    if (storage) return created
    fallbackTabId ||= created
    return fallbackTabId
  } catch {
    fallbackTabId ||= globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    return fallbackTabId
  }
}

function notifyGuestModeChange() {
  try {
    globalThis.window?.dispatchEvent(new Event(GUEST_MODE_CHANGE_EVENT))
  } catch {
    // Storage remains authoritative when an older browser cannot dispatch the event.
  }
}

function bytesToBase64(bytes) {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return globalThis.btoa(binary)
}

function base64ToBytes(value) {
  const binary = globalThis.atob(String(value || ''))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function derivePinDigest(pin, salt) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('Secure PIN protection is unavailable on this device.')
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const digest = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256
  )
  return bytesToBase64(new Uint8Array(digest))
}

function safeCart(cart) {
  return Array.isArray(cart) ? cart.map(row => ({ ...row })) : []
}

function safeIds(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)))
    .sort()
}

function isStoredGuestModeSession(value) {
  if (!value || value.version !== GUEST_MODE_VERSION || value.active !== true) return false
  const tableId = String(value.tableId || '').trim()
  if (!String(value.id || '').trim() || !tableId) return false
  if (!String(value.staffUserId || '').trim() || value.routePath !== `/waiter/order/${encodeURIComponent(tableId)}`) return false
  if (!String(value.ownerTabId || '').trim()) return false
  if (!String(value.pinSalt || '').trim() || !String(value.pinDigest || '').trim()) return false
  return true
}

export function isGuestModeOwnedByCurrentTab(session, storage = defaultTabStorage()) {
  return isStoredGuestModeSession(session) && session.ownerTabId === getGuestModeTabId(storage)
}

export function getGuestModeLockState(session, {
  authenticatedUserId = '',
  profileUserId = '',
  profileStatus = '',
  canViewTables = false,
  ownsGuestModeSession = true,
} = {}) {
  if (!isStoredGuestModeSession(session)) return 'inactive'
  if (!String(authenticatedUserId || '').trim()) return 'signed_out'
  if (!ownsGuestModeSession) return 'recovery'
  const canResume = String(authenticatedUserId) === session.staffUserId &&
    String(profileUserId) === session.staffUserId &&
    profileStatus !== 'disabled' &&
    profileStatus !== 'pending' &&
    canViewTables === true
  return canResume ? 'active' : 'recovery'
}

export function getGuestModePinLength(session) {
  return Number(session?.pinLength) === GUEST_MODE_PIN_LENGTH
    ? GUEST_MODE_PIN_LENGTH
    : LEGACY_GUEST_MODE_PIN_LENGTH
}

export function normalizeGuestModePin(value, pinLength = GUEST_MODE_PIN_LENGTH) {
  const expectedLength = Number(pinLength) === LEGACY_GUEST_MODE_PIN_LENGTH
    ? LEGACY_GUEST_MODE_PIN_LENGTH
    : GUEST_MODE_PIN_LENGTH
  return String(value || '').replace(/\D/g, '').slice(0, expectedLength)
}

export function isValidGuestModePin(value, pinLength = GUEST_MODE_PIN_LENGTH) {
  const expectedLength = Number(pinLength) === LEGACY_GUEST_MODE_PIN_LENGTH
    ? LEGACY_GUEST_MODE_PIN_LENGTH
    : GUEST_MODE_PIN_LENGTH
  return new RegExp(`^\\d{${expectedLength}}$`).test(String(value || ''))
}

export async function createGuestModeSession({
  tableId,
  staffUserId,
  pin,
  priceMode = PRICE_MODE_TOURIST,
  guestLang = 'en',
  cart = [],
  activeOrderIds = [],
  ownerTabId = getGuestModeTabId(),
  pinLength = GUEST_MODE_PIN_LENGTH,
}) {
  const normalizedTableId = String(tableId || '').trim()
  const normalizedStaffUserId = String(staffUserId || '').trim()
  const expectedPinLength = Number(pinLength) === LEGACY_GUEST_MODE_PIN_LENGTH
    ? LEGACY_GUEST_MODE_PIN_LENGTH
    : GUEST_MODE_PIN_LENGTH
  const normalizedPin = normalizeGuestModePin(pin, expectedPinLength)
  const normalizedOwnerTabId = String(ownerTabId || '').trim()
  const validPriceMode = priceMode === PRICE_MODE_REGULAR || priceMode === PRICE_MODE_TOURIST
  if (!normalizedTableId || !normalizedStaffUserId || !normalizedOwnerTabId || !isValidGuestModePin(normalizedPin, expectedPinLength) || !validPriceMode) {
    throw new Error('Guest mode requires a table, staff member, R or T pricing, and a valid PIN.')
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure PIN protection is unavailable on this device.')
  }

  const saltBytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(saltBytes)
  const pinSalt = bytesToBase64(saltBytes)
  const pinDigest = await derivePinDigest(normalizedPin, pinSalt)
  const createdAt = new Date().toISOString()

  return {
    version: GUEST_MODE_VERSION,
    id: globalThis.crypto.randomUUID?.() || `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    active: true,
    tableId: normalizedTableId,
    staffUserId: normalizedStaffUserId,
    ownerTabId: normalizedOwnerTabId,
    routePath: `/waiter/order/${encodeURIComponent(normalizedTableId)}`,
    priceMode,
    pinLength: expectedPinLength,
    guestLang: VALID_LANGS.has(guestLang) ? guestLang : 'en',
    cart: safeCart(cart),
    activeOrderIds: safeIds(activeOrderIds),
    finished: false,
    failedAttempts: 0,
    lockedUntil: 0,
    pinSalt,
    pinDigest,
    createdAt,
    updatedAt: createdAt,
  }
}

export async function verifyGuestModePin(session, pin) {
  const pinLength = getGuestModePinLength(session)
  if (!isStoredGuestModeSession(session) || !isValidGuestModePin(pin, pinLength)) return false
  const digest = await derivePinDigest(String(pin), session.pinSalt)
  if (digest.length !== session.pinDigest.length) return false
  let mismatch = 0
  for (let index = 0; index < digest.length; index += 1) {
    mismatch |= digest.charCodeAt(index) ^ session.pinDigest.charCodeAt(index)
  }
  return mismatch === 0
}

export function readGuestModeSession(storage = defaultStorage()) {
  if (!storage) return null
  try {
    const parsed = JSON.parse(storage.getItem(GUEST_MODE_STORAGE_KEY) || 'null')
    if (!isStoredGuestModeSession(parsed)) return null
    return {
      ...parsed,
      pinLength: getGuestModePinLength(parsed),
      priceMode: normalizeGuestModePriceMode(parsed.priceMode),
      cart: safeCart(parsed.cart),
      activeOrderIds: safeIds(parsed.activeOrderIds),
    }
  } catch {
    return null
  }
}

export function writeGuestModeSession(session, storage = defaultStorage()) {
  if (!storage || !isStoredGuestModeSession(session)) {
    throw new Error('Guest mode could not be safely stored on this device.')
  }
  const next = {
    ...session,
    priceMode: normalizeGuestModePriceMode(session.priceMode),
    cart: safeCart(session.cart),
    activeOrderIds: safeIds(session.activeOrderIds),
    updatedAt: new Date().toISOString(),
  }
  storage.setItem(GUEST_MODE_STORAGE_KEY, JSON.stringify(next))
  notifyGuestModeChange()
  return next
}

export function updateGuestModeSession(patch, storage = defaultStorage()) {
  const current = readGuestModeSession(storage)
  if (!current) return null
  const values = typeof patch === 'function' ? patch(current) : patch
  return writeGuestModeSession({ ...current, ...(values || {}) }, storage)
}

export function clearGuestModeSession(storage = defaultStorage()) {
  try {
    storage?.removeItem(GUEST_MODE_STORAGE_KEY)
  } finally {
    notifyGuestModeChange()
  }
}

export function isGuestModeSessionFor(session, { tableId, staffUserId, pathname } = {}) {
  if (!isStoredGuestModeSession(session)) return false
  if (!isGuestModeOwnedByCurrentTab(session)) return false
  if (tableId != null && String(session.tableId) !== String(tableId)) return false
  if (staffUserId != null && String(session.staffUserId) !== String(staffUserId)) return false
  if (pathname != null && session.routePath !== pathname) return false
  return true
}

export function guestModePinLockSeconds(session, now = Date.now()) {
  const remainingMs = Math.max(0, Number(session?.lockedUntil || 0) - Number(now || 0))
  return Math.ceil(remainingMs / 1000)
}

export function registerGuestModePinFailure(session, now = Date.now()) {
  const attempts = Math.max(0, Number(session?.failedAttempts) || 0) + 1
  if (attempts >= GUEST_MODE_MAX_PIN_ATTEMPTS) {
    return {
      ...session,
      failedAttempts: 0,
      lockedUntil: Number(now) + GUEST_MODE_PIN_LOCK_MS,
    }
  }
  return { ...session, failedAttempts: attempts }
}

export function subscribeToGuestModeChanges(listener) {
  if (typeof globalThis.window === 'undefined') return () => {}
  const handleStorage = event => {
    if (!event?.key || event.key === GUEST_MODE_STORAGE_KEY) listener()
  }
  globalThis.window.addEventListener(GUEST_MODE_CHANGE_EVENT, listener)
  globalThis.window.addEventListener('storage', handleStorage)
  globalThis.window.addEventListener('pageshow', listener)
  return () => {
    globalThis.window.removeEventListener(GUEST_MODE_CHANGE_EVENT, listener)
    globalThis.window.removeEventListener('storage', handleStorage)
    globalThis.window.removeEventListener('pageshow', listener)
  }
}
