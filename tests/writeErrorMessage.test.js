import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatWriteError, writeErrorReason } from '../src/lib/writeErrorMessage.js'

const errors = [
  [{ message: 'Cashier access is required to move a bill back to its table', code: '42501' }, 'bill'],
  [{ code: 'POS_BILL_WITH_CASHIER' }, 'bill'],
  [{ message: 'Payment amount mismatch: expected 1139650, received 1130000', code: '22023' }, 'mismatch'],
  [{ code: '42501' }, 'permission'],
  [{ code: 'POS_WRITE_TIMEOUT' }, 'timeout'],
  [new Error('Request timed out'), 'timeout'],
  [{ code: 'POS_WRITE_TIMEOUT', kitchenSubmissionUnresolved: true }, 'pending'],
  [{ code: 'POS_KITCHEN_SUBMISSION_USER_CHANGED', kitchenSubmissionUnresolved: true }, 'identity'],
  [{ message: 'order o1 is already paid, completed, cancelled, or unavailable' }, 'closed'],
  [{ message: 'menu item is archived' }, 'unavailable'],
  [{ code: 'PGRST301' }, 'session'],
  [null, 'unknown'],
  [{ message: 'Internal SQL failure', details: 'private diagnostic', hint: 'English only hint' }, 'unknown'],
]

test('write errors explain the cause and recovery in all supported languages without raw server text', () => {
  for (const [error, reason] of errors) {
    assert.equal(writeErrorReason(error), reason)
    const messages = ['en', 'ru', 'uz'].map(lang => formatWriteError(error, lang, 'SEND_TO_KITCHEN'))
    assert.equal(new Set(messages).size, 3)
    for (const message of messages) {
      assert.doesNotMatch(message, /undefined|Unknown error|Internal SQL|private diagnostic|English only hint|42501/)
      assert.ok(message.length > 60)
    }
    assert.doesNotMatch(messages[1], /[a-z]/i)
    assert.doesNotMatch(messages[2], /Cashier access|Request timed out|Payment amount mismatch/)
  }
})

test('payment errors explain refresh without losing original diagnostic data', () => {
  const error = { message: 'Payment amount mismatch: expected 1139650, received 1130000', details: '{"expected_total":1139650}', hint: 'Refresh the bill and retry', code: '22023' }
  const original = { ...error }
  assert.match(formatWriteError(error, 'en', 'MARK_ORDER_PAID'), /^Payment failed:.*Refresh the bill/)
  assert.deepEqual(error, original)
  const source = readFileSync(new URL('../src/store/AppContext.jsx', import.meta.url), 'utf8')
  assert.match(source, /console\.error\('\[db\] write failed:', action\.type, err\)/)
})

test('unknown language falls back to English and changing language re-renders stored write errors', () => {
  assert.equal(formatWriteError(null, 'xx'), formatWriteError(null, 'en'))
  const source = readFileSync(new URL('../src/store/AppContext.jsx', import.meta.url), 'utf8')
  assert.match(source, /formatWriteError\(state.connectionNotice.error, state.lang, state.connectionNotice.actionType\)/)
  assert.doesNotMatch(source, /message: formatWriteError/)
})

test('bill refresh errors translate at render time and changing language does not reload the bill', () => {
  const source = readFileSync(new URL('../src/pages/CashierBill.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('function cashierRefreshErrorMessage(')
  const end = source.indexOf('// ── Main', start)
  const render = new Function(`${source.slice(start, end)}; return cashierRefreshErrorMessage`)()
  for (const lang of ['uz', 'ru', 'en']) {
    assert.doesNotMatch(render({ message: 'raw backend diagnostic' }, lang), /raw backend diagnostic/)
    assert.ok(render({ code: 'POS_READ_TIMEOUT' }, lang).length > 60)
  }
  assert.match(source, /setPaymentRefreshMessage\(\{ error \}\)/)
  assert.match(source, /\}, \[refreshCurrentBill\]\)/)
  assert.doesNotMatch(source, /\[refreshCurrentBill, lang\]/)
  const receipt = readFileSync(new URL('../src/pages/Receipt.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(receipt, /description=\{lookupState.error\}/)
})
