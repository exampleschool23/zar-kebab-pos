import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSalaryEventRetryTargets,
  getSalaryPaymentRetryTargets,
} from '../api/telegram/_lib/deliveryRetry.js'

const NOW = Date.parse('2026-07-30T18:00:00.000Z')
const TWO_MINUTES = 2 * 60 * 1000

test('payment retry sends only to the group when the employee message succeeded', () => {
  assert.deepEqual(getSalaryPaymentRetryTargets({
    status: 'sent',
    telegram_message_id: '607',
    group_status: 'skipped',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: false,
    group: true,
  })
})

test('payment retry sends only to the employee when the group message succeeded', () => {
  assert.deepEqual(getSalaryPaymentRetryTargets({
    status: 'failed',
    group_status: 'sent',
    group_telegram_message_id: '608',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: true,
    group: false,
  })
})

test('sent or confirmed payment destinations are never selected again', () => {
  assert.deepEqual(getSalaryPaymentRetryTargets({
    status: 'confirmed',
    telegram_message_id: '607',
    group_status: 'sent',
    group_telegram_message_id: '608',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: false,
    group: false,
  })
})

test('recent pending payment destinations are protected from a double tap', () => {
  assert.deepEqual(getSalaryPaymentRetryTargets({
    status: 'pending',
    attempted_at: '2026-07-30T17:59:30.000Z',
    group_status: 'pending',
    group_attempted_at: '2026-07-30T17:59:30.000Z',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: false,
    group: false,
  })
})

test('a stale pending payment retries only the unresolved destination', () => {
  assert.deepEqual(getSalaryPaymentRetryTargets({
    status: 'sent',
    attempted_at: '2026-07-30T17:55:00.000Z',
    group_status: 'pending',
    group_attempted_at: '2026-07-30T17:55:00.000Z',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: false,
    group: true,
  })
})

test('bonus, fine, and absence retries also select destinations independently', () => {
  assert.deepEqual(getSalaryEventRetryTargets({
    employee_status: 'sent',
    status: 'failed',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: false,
    group: true,
  })

  assert.deepEqual(getSalaryEventRetryTargets({
    employee_status: 'not_attempted',
    status: 'sent',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: true,
    group: false,
  })
})

test('recent pending salary events are protected and stale ones can retry', () => {
  assert.deepEqual(getSalaryEventRetryTargets({
    employee_status: 'pending',
    employee_attempted_at: '2026-07-30T17:59:30.000Z',
    status: 'sent',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: false,
    group: false,
  })

  assert.deepEqual(getSalaryEventRetryTargets({
    employee_status: 'pending',
    employee_attempted_at: '2026-07-30T17:55:00.000Z',
    status: 'sent',
  }, {
    now: NOW,
    pendingRetryMs: TWO_MINUTES,
  }), {
    employee: true,
    group: false,
  })
})
