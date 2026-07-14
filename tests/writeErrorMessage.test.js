import test from 'node:test'
import assert from 'node:assert/strict'
import { formatWriteError } from '../src/lib/writeErrorMessage.js'

test('payment failures show the exact Supabase message, code, details, and hint', () => {
  const message = formatWriteError({
    message: 'Payment amount mismatch: expected 1139650, received 1130000',
    code: '22023',
    details: '{"expected_total":1139650,"received_total":1130000}',
    hint: 'Refresh the bill and retry',
  }, 'en', 'MARK_ORDER_PAID')

  assert.match(message, /^Payment failed:/)
  assert.match(message, /Payment amount mismatch: expected 1139650, received 1130000/)
  assert.match(message, /\[code: 22023\]/)
  assert.match(message, /Details: \{"expected_total":1139650,"received_total":1130000\}/)
  assert.match(message, /Hint: Refresh the bill and retry/)
  assert.doesNotMatch(message, /Check the connection/)
})

test('write failures preserve ordinary Error messages and localize the action label', () => {
  assert.equal(
    formatWriteError(new Error('Request timed out'), 'uz', 'UPDATE_MENU_ITEM'),
    'O‘zgarishlarni saqlab bo‘lmadi: Request timed out',
  )
})

test('write failures still provide a useful fallback when the error is empty', () => {
  assert.equal(formatWriteError(null, 'en'), 'Could not save changes: Unknown error')
})

