import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRetryableProfileLoadError,
  loadProfileWithRetry,
} from '../src/lib/profileLoading.js'

test('profile loading classifies transient connection and gateway failures as retryable', () => {
  assert.equal(isRetryableProfileLoadError(new TypeError('Failed to fetch')), true)
  assert.equal(isRetryableProfileLoadError({ status: 503, message: 'Service unavailable' }), true)
  assert.equal(isRetryableProfileLoadError({ status: 401, message: 'JWT expired' }), true)
  assert.equal(isRetryableProfileLoadError({ code: 'POS_READ_TIMEOUT', message: 'Refreshing data timed out' }), true)
  assert.equal(isRetryableProfileLoadError({ status: 403, message: 'permission denied' }), false)
})

test('profile loading retries a transient failure and returns the recovered profile', async () => {
  let attempts = 0
  const waits = []
  const profile = await loadProfileWithRetry(
    async () => {
      attempts += 1
      if (attempts < 3) throw new TypeError('Failed to fetch')
      return { id: 'staff-1', status: 'active' }
    },
    {
      retryDelaysMs: [25, 75],
      waitFor: async delay => { waits.push(delay) },
    }
  )

  assert.deepEqual(profile, { id: 'staff-1', status: 'active' })
  assert.equal(attempts, 3)
  assert.deepEqual(waits, [25, 75])
})

test('profile loading does not retry permission failures', async () => {
  let attempts = 0
  await assert.rejects(
    loadProfileWithRetry(
      async () => {
        attempts += 1
        throw Object.assign(new Error('permission denied'), { status: 403 })
      },
      { retryDelaysMs: [0, 0], waitFor: async () => {} }
    ),
    /permission denied/
  )
  assert.equal(attempts, 1)
})
