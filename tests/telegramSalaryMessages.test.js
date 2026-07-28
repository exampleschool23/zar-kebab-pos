import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDailySalaryMessage,
  getDailySalaryNotificationSummary,
  parseEmployeeStartToken,
} from '../api/telegram/_lib/salaryMessages.js'

const salaryProfile = {
  id: 'salary-1',
  employee_name: 'Test Employee',
  joined_at: '2026-07-01',
  is_active: true,
  rates: [{
    id: 'rate-1',
    effective_from: '2026-07-01',
    amount: 150_000,
    rate_unit: 'daily',
  }],
  payments: [{ paid_date: '2026-07-10', amount: 300_000 }],
  bonuses: [],
  absences: [],
  fines: [{
    fine_date: '2026-07-29',
    amount: 20_000,
    reason: '<Late arrival>',
  }],
}

test('daily salary summary uses shared accrual, fine, and due calculations', () => {
  const summary = getDailySalaryNotificationSummary(salaryProfile, '2026-07-29')
  assert.equal(summary.earned, 150_000)
  assert.equal(summary.fineTotal, 20_000)
  assert.equal(summary.due, 4_030_000)
})

test('daily salary message escapes fine reasons and supports employee language', () => {
  const message = buildDailySalaryMessage(salaryProfile, '2026-07-29', 'en')
  assert.match(message, /Daily salary summary/)
  assert.match(message, /150 000 UZS/)
  assert.match(message, /20 000 UZS/)
  assert.match(message, /&lt;Late arrival&gt;/)
  assert.doesNotMatch(message, /<Late arrival>/)
})

test('employee start links accept only the expected token shape', () => {
  const token = 'd1d8de7b-80bf-4f82-84b1-341f06356f75'
  assert.equal(parseEmployeeStartToken(`/start employee_${token}`), token)
  assert.equal(parseEmployeeStartToken(`/start@zar_bot employee_${token}`), token)
  assert.equal(parseEmployeeStartToken('/start employee_not-a-token'), '')
})
