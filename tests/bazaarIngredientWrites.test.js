import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bazaarIngredientMatches,
  isBazaarIngredientNetworkError,
  runBazaarIngredientWriteWithRecovery,
} from '../src/lib/bazaarIngredientWrites.js'

test('recognizes Safari and fetch transport failures without swallowing database errors', () => {
  assert.equal(isBazaarIngredientNetworkError(new TypeError('Load failed')), true)
  assert.equal(isBazaarIngredientNetworkError({ message: 'TypeError: Failed to fetch' }), true)
  assert.equal(isBazaarIngredientNetworkError({ code: 'POS_WRITE_TIMEOUT' }), true)
  assert.equal(isBazaarIngredientNetworkError({ code: '23505', message: 'duplicate key' }), false)
})

test('reconciles an uncertain ingredient save before retrying it', async () => {
  let writes = 0
  const saved = { product_key: 'piyoz', product_name: 'piyoz', normal_unit_price: 3000 }
  const result = await runBazaarIngredientWriteWithRecovery({
    write: async () => {
      writes += 1
      return { data: null, error: { message: 'TypeError: Load failed' } }
    },
    reconcile: async () => saved,
  })

  assert.equal(writes, 1)
  assert.equal(result.error, null)
  assert.equal(result.recovered, true)
  assert.deepEqual(result.data, saved)
})

test('retries once after reconciliation confirms the first write did not land', async () => {
  let writes = 0
  const result = await runBazaarIngredientWriteWithRecovery({
    write: async () => {
      writes += 1
      return writes === 1
        ? { data: null, error: { message: 'Load failed' } }
        : { data: { product_key: 'piyoz' }, error: null }
    },
    reconcile: async () => null,
  })

  assert.equal(writes, 2)
  assert.equal(result.error, null)
})

test('recovers when the browser throws instead of returning a transport error', async () => {
  const saved = { product_key: 'piyoz' }
  const result = await runBazaarIngredientWriteWithRecovery({
    write: async () => { throw new TypeError('Load failed') },
    reconcile: async () => saved,
  })

  assert.equal(result.error, null)
  assert.deepEqual(result.data, saved)
})

test('ingredient reconciliation compares the durable fields', () => {
  const ingredient = { product_name: 'piyoz', category: 'vegetables', unit: 'kg', normal_unit_price: 3000, is_active: true }
  assert.equal(bazaarIngredientMatches(ingredient, { ...ingredient, normal_unit_price: '3000' }), true)
  assert.equal(bazaarIngredientMatches(ingredient, { normal_unit_price: 3500 }), false)
})
