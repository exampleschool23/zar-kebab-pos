import test from 'node:test'
import assert from 'node:assert/strict'
import { RESUME_RECOVERY_AWAY_MS, shouldRecoverOnResume } from '../src/lib/resumeRecovery.js'

test('brief focus and tab switches keep the live connection without reloading', () => {
  for (const eventType of ['focus', 'visibilitychange']) {
    assert.equal(shouldRecoverOnResume({ eventType, awayMs: 0, realtimeHealthy: true }), false)
    assert.equal(shouldRecoverOnResume({ eventType, awayMs: RESUME_RECOVERY_AWAY_MS - 1, realtimeHealthy: true }), false)
  }
})

test('a real absence, a network return or a broken channel still recovers', () => {
  assert.equal(shouldRecoverOnResume({ eventType: 'visibilitychange', awayMs: RESUME_RECOVERY_AWAY_MS, realtimeHealthy: true }), true)
  assert.equal(shouldRecoverOnResume({ eventType: 'online', awayMs: 0, realtimeHealthy: true }), true)
  assert.equal(shouldRecoverOnResume({ eventType: 'focus', awayMs: 0, realtimeHealthy: false }), true)
})
