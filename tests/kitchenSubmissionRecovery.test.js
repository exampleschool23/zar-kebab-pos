import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  confirmKitchenRoundSubmission,
  waitForKitchenRoundSubmission,
} from '../src/lib/db.js'

const appContextSource = readFileSync(new URL('../src/store/AppContext.jsx', import.meta.url), 'utf8')
const classifierSource = appContextSource.slice(
  appContextSource.indexOf('function isAmbiguousKitchenHttpFailure'),
  appContextSource.indexOf('\n\nfunction pendingKitchenCartSnapshot')
).replace('export function isKitchenWriteOutcomeUnknown', 'function isKitchenWriteOutcomeUnknown')
const isKitchenWriteOutcomeUnknown = new Function(
  'isWriteTimeoutError',
  `${classifierSource}\nreturn isKitchenWriteOutcomeUnknown`
)(error => error?.code === 'POS_WRITE_TIMEOUT')

const submission = {
  type: 'SEND_TO_KITCHEN',
  _orderId: 'order-1',
  _kitchenRoundId: 'round-1',
  _items: [{ id: 'item-1' }, { id: 'item-2' }],
}

function createDb(responses) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, filters: [], inFilter: null, signal: null, select: '' }
      calls.push(call)
      const response = responses.shift() || { data: [], error: null }
      const builder = {
        select(columns) {
          call.select = columns
          return builder
        },
        eq(column, value) {
          call.filters.push([column, value])
          return builder
        },
        in(column, values) {
          call.inFilter = [column, values]
          return builder
        },
        abortSignal(signal) {
          call.signal = signal
          return builder
        },
        maybeSingle() {
          return builder
        },
        then(resolve, reject) {
          return Promise.resolve(response).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

test('timeout reconciliation confirms only the complete exact kitchen round', async () => {
  const db = createDb([{
    data: { item_ids: ['item-1', 'item-2'] },
    error: null,
  }])
  const controller = new AbortController()

  assert.equal(await confirmKitchenRoundSubmission(submission, {
    dbClient: db,
    signal: controller.signal,
  }), true)
  assert.deepEqual(db.calls, [{
    table: 'order_kitchen_rounds',
    select: 'item_ids',
    filters: [
      ['order_id', 'order-1'],
      ['kitchen_round_id', 'round-1'],
    ],
    inFilter: null,
    signal: controller.signal,
  }])
})

test('partial or invalid kitchen attempts are never accepted as committed', async () => {
  const partialDb = createDb([{ data: { item_ids: ['item-1'] }, error: null }])
  await assert.rejects(
    confirmKitchenRoundSubmission(submission, { dbClient: partialDb }),
    error => error?.code === 'POS_KITCHEN_RECEIPT_MISMATCH' && error?.kitchenSubmissionUnresolved === true
  )

  const invalidDb = createDb([])
  assert.equal(await confirmKitchenRoundSubmission({
    ...submission,
    _kitchenRoundId: '',
  }, { dbClient: invalidDb }), false)
  assert.equal(invalidDb.calls.length, 0)
})

test('rolling deployment falls back to the live exact round when the receipt table is missing', async () => {
  const db = createDb([
    {
      data: null,
      error: { code: '42P01', message: 'relation "order_kitchen_rounds" does not exist' },
    },
    { data: [{ id: 'item-1' }, { id: 'item-2' }], error: null },
  ])

  assert.equal(await confirmKitchenRoundSubmission(submission, { dbClient: db }), true)
  assert.deepEqual(db.calls.map(call => call.table), ['order_kitchen_rounds', 'order_items'])
})

test('a partial legacy receipt remains valid when cancellation history accounts for the missing item', async () => {
  const db = createDb([
    { data: { item_ids: ['item-1'] }, error: null },
    { data: [], error: null },
    { data: [{ order_item_id: 'item-2' }], error: null },
  ])

  assert.equal(await confirmKitchenRoundSubmission(submission, { dbClient: db }), true)
  assert.deepEqual(db.calls[2], {
    table: 'order_item_cancellations',
    select: 'order_item_id',
    filters: [['order_id', 'order-1']],
    inFilter: ['order_item_id', ['item-2']],
    signal: null,
  })
})

test('timeout reconciliation polls briefly for a transaction that commits late', async () => {
  const db = createDb([
    { data: null, error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: null, error: null },
    { data: [{ id: 'item-1' }], error: null },
    { data: [], error: null },
    { data: { item_ids: ['item-1', 'item-2'] }, error: null },
  ])

  assert.equal(await waitForKitchenRoundSubmission(submission, {
    dbClient: db,
    attempts: 3,
    delayMs: 0,
  }), true)
  assert.equal(db.calls.filter(call => call.table === 'order_kitchen_rounds').length, 3)
  assert.equal(db.calls.filter(call => call.table === 'order_items').length, 2)
})

test('timeout reconciliation keeps polling beyond three checks until its deadline', async () => {
  const db = createDb([
    { data: null, error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: null, error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: null, error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: { item_ids: ['item-1', 'item-2'] }, error: null },
  ])
  const controller = new AbortController()

  assert.equal(await waitForKitchenRoundSubmission(submission, {
    dbClient: db,
    signal: controller.signal,
    delayMs: 0,
  }), true)
  assert.equal(db.calls.filter(call => call.table === 'order_kitchen_rounds').length, 4)
  assert.equal(db.calls.filter(call => call.table === 'order_items').length, 3)
})

test('timeout reconciliation exits promptly when its deadline aborts', async () => {
  const db = createDb([
    { data: null, error: null },
    { data: [], error: null },
    { data: [], error: null },
  ])
  const controller = new AbortController()
  const deadlineError = new Error('confirmation deadline reached')
  const timer = setTimeout(() => controller.abort(deadlineError), 5)

  await assert.rejects(
    waitForKitchenRoundSubmission(submission, {
      dbClient: db,
      signal: controller.signal,
      delayMs: 50,
    }),
    /confirmation deadline reached/
  )
  clearTimeout(timer)
  assert.equal(db.calls.filter(call => call.table === 'order_items').length, 1)
})

test('timeout reconciliation surfaces a read failure when no check succeeds', async () => {
  const error = new Error('network unavailable')
  const db = createDb([
    { data: null, error },
    { data: null, error },
  ])

  await assert.rejects(
    waitForKitchenRoundSubmission(submission, {
      dbClient: db,
      attempts: 2,
      delayMs: 0,
    }),
    /network unavailable/
  )
})

test('gateway and retry-unsafe HTTP failures retain the exact kitchen attempt', () => {
  const ambiguousErrors = [
    { status: 408, message: 'Request Timeout' },
    { statusCode: '425', message: 'Too Early' },
    { code: 429, message: 'Too Many Requests' },
    { status: 500, message: 'Server failed' },
    { code: 'PGRST503', message: 'Service temporarily unavailable' },
    { message: 'HTTP 502 Bad Gateway' },
    { message: 'Service Unavailable' },
    { details: 'upstream connection reset before response' },
  ]

  for (const error of ambiguousErrors) {
    assert.equal(isKitchenWriteOutcomeUnknown(error), true, JSON.stringify(error))
  }
})

test('definitive database rejections do not stay marked as unknown outcomes', () => {
  assert.equal(isKitchenWriteOutcomeUnknown({ code: '23505', message: 'duplicate key value violates unique constraint' }), false)
  assert.equal(isKitchenWriteOutcomeUnknown({ status: 400, message: 'invalid input syntax' }), false)
  assert.equal(isKitchenWriteOutcomeUnknown({ status: 403, message: 'permission denied' }), false)
})
