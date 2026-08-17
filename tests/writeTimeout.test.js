import test from 'node:test'
import assert from 'node:assert/strict'
import {
  POS_READ_TIMEOUT_MS,
  POS_WRITE_TIMEOUT_MS,
  isReadTimeoutError,
  isWriteTimeoutError,
  withReadTimeout,
  withWriteTimeout,
} from '../src/lib/writeTimeout.js'

test('write timeout rejects hung submits so loading state can reset', async () => {
  const startedAt = Date.now()

  await assert.rejects(
    withWriteTimeout(new Promise(() => {}), 'SEND_TO_KITCHEN', 5),
    error => {
      assert.equal(isWriteTimeoutError(error), true)
      assert.equal(error.name, 'POSWriteTimeoutError')
      assert.equal(error.code, 'POS_WRITE_TIMEOUT')
      assert.equal(error.actionType, 'SEND_TO_KITCHEN')
      assert.match(error.message, /took too long/i)
      return true
    }
  )

  assert.ok(Date.now() - startedAt < 500)
})

test('write timeout aborts signal-aware writes', async () => {
  let receivedSignal

  await assert.rejects(
    withWriteTimeout(signal => {
      receivedSignal = signal
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    }, 'SEND_TO_KITCHEN', 5),
    error => {
      assert.equal(isWriteTimeoutError(error), true)
      assert.equal(error.actionType, 'SEND_TO_KITCHEN')
      return true
    }
  )

  assert.equal(receivedSignal.aborted, true)
  assert.equal(isWriteTimeoutError(receivedSignal.reason), true)
})

test('write timeout returns normally for completed writes', async () => {
  const result = await withWriteTimeout(Promise.resolve('saved'), 'SEND_TO_KITCHEN', 50)

  assert.equal(result, 'saved')
})

test('default write timeout is finite for operational writes', () => {
  assert.equal(Number.isFinite(POS_WRITE_TIMEOUT_MS), true)
  assert.ok(POS_WRITE_TIMEOUT_MS > 0)
})

test('cashier read timeout aborts a hung bill refresh', async () => {
  let receivedSignal

  await assert.rejects(
    withReadTimeout(signal => {
      receivedSignal = signal
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    }, 'REFRESH_CASHIER_BILL', 5),
    error => {
      assert.equal(isReadTimeoutError(error), true)
      assert.equal(error.name, 'POSReadTimeoutError')
      assert.equal(error.code, 'POS_READ_TIMEOUT')
      assert.equal(error.actionType, 'REFRESH_CASHIER_BILL')
      return true
    }
  )

  assert.equal(receivedSignal.aborted, true)
  assert.equal(isReadTimeoutError(receivedSignal.reason), true)
})

test('default read timeout is finite for operational refreshes', () => {
  assert.equal(Number.isFinite(POS_READ_TIMEOUT_MS), true)
  assert.ok(POS_READ_TIMEOUT_MS > 0)
})
