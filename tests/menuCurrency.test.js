import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MENU_CURRENCY_CACHE_KEY,
  MENU_CURRENCY_RATE_TTL_DAYS,
  formatMenuCurrency,
  loadMenuCurrencyRates,
  normalizeMenuCurrency,
} from '../src/lib/menuCurrency.js'

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: key => map.get(key) || null,
    setItem: (key, value) => map.set(key, value),
  }
}

test('menu currency normalization keeps UZS as the default', () => {
  assert.equal(normalizeMenuCurrency('usd'), 'USD')
  assert.equal(normalizeMenuCurrency('EUR'), 'EUR')
  assert.equal(normalizeMenuCurrency('gbp'), 'UZS')
})

test('menu currency formatter converts UZS with cached rates', () => {
  assert.equal(formatMenuCurrency(30000, 'USD', { USD: 0.00008 }), '$2.40')
  assert.equal(formatMenuCurrency(30000, 'EUR', { EUR: 0.000074 }), '€2.22')
  assert.match(formatMenuCurrency(30000, 'USD', {}), /^30\s000 UZS$/)
})

test('menu currency rates load from live UZS exchange data and cache it', async () => {
  const storage = memoryStorage()
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    return {
      ok: true,
      json: async () => ({ rates: { USD: 0.00008, EUR: 0.000074 } }),
    }
  }

  const rates = await loadMenuCurrencyRates({ fetchImpl, storage, now: 1000 })
  assert.equal(rates.USD, 0.00008)
  assert.equal(rates.EUR, 0.000074)
  assert.equal(rates.source, 'open.er-api.com')
  assert.equal(calls.length, 1)
  assert.match(storage.getItem(MENU_CURRENCY_CACHE_KEY), /0\.00008/)
})

test('menu currency rates use cached values for three days before fetching again', async () => {
  const storage = memoryStorage({
    [MENU_CURRENCY_CACHE_KEY]: JSON.stringify({
      UZS: 1,
      USD: 0.00008,
      EUR: 0.000074,
      fetchedAt: 1000,
      source: 'cache',
    }),
  })
  const rates = await loadMenuCurrencyRates({
    storage,
    now: 1000 + (MENU_CURRENCY_RATE_TTL_DAYS * 24 * 60 * 60 * 1000) - 1,
    fetchImpl: async () => {
      throw new Error('should not fetch fresh cache')
    },
  })
  assert.equal(rates.USD, 0.00008)
  assert.equal(rates.source, 'cache')
})

test('menu currency rates refresh after the three day cache expires', async () => {
  const storage = memoryStorage({
    [MENU_CURRENCY_CACHE_KEY]: JSON.stringify({
      UZS: 1,
      USD: 0.00008,
      EUR: 0.000074,
      fetchedAt: 1000,
      source: 'cache',
    }),
  })
  const calls = []
  const rates = await loadMenuCurrencyRates({
    storage,
    now: 1000 + (MENU_CURRENCY_RATE_TTL_DAYS * 24 * 60 * 60 * 1000),
    fetchImpl: async url => {
      calls.push(url)
      return {
        ok: true,
        json: async () => ({ rates: { USD: 0.00009, EUR: 0.00008 } }),
      }
    },
  })

  assert.equal(calls.length, 1)
  assert.equal(rates.USD, 0.00009)
  assert.equal(rates.source, 'open.er-api.com')
})

test('menu currency rates fall back to cached rates when live requests fail', async () => {
  const storage = memoryStorage({
    [MENU_CURRENCY_CACHE_KEY]: JSON.stringify({
      UZS: 1,
      USD: 0.00007,
      EUR: 0.000065,
      fetchedAt: 1,
      source: 'old-cache',
    }),
  })
  const rates = await loadMenuCurrencyRates({
    storage,
    now: 1000 + 60 * 60 * 1000,
    fetchImpl: async () => ({ ok: false, status: 500 }),
  })
  assert.equal(rates.USD, 0.00007)
  assert.equal(rates.source, 'old-cache')
})
