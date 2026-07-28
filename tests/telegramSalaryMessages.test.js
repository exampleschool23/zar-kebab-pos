import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDailySalaryMessage,
  getDailySalaryNotificationSummary,
  parseEmployeeStartToken,
} from '../api/telegram/_lib/salaryMessages.js'

const salaryProfile = {
  id: 'salary-1',
  employee_name: 'Иван Петров',
  joined_at: '2026-07-01',
  is_active: true,
  rates: [{
    id: 'rate-1',
    effective_from: '2026-07-01',
    amount: 150_000,
    rate_unit: 'daily',
  }],
  payments: [
    { paid_date: '2026-07-10', amount: 300_000 },
    { paid_date: '2026-07-29', amount: 100_000, payment_method: 'cash', note: 'Аванс' },
  ],
  bonuses: [{
    bonus_date: '2026-07-29',
    amount: 50_000,
    payment_method: 'card',
    note: '<Good work>',
  }],
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
  assert.equal(summary.bonusTotal, 50_000)
  assert.equal(summary.fineTotal, 20_000)
  assert.equal(summary.paymentTotal, 100_000)
  assert.equal(summary.due, 3_930_000)
})

test('daily salary message formats date and shows bonuses, fines, and salary payments', () => {
  const message = buildDailySalaryMessage(salaryProfile, '2026-07-29', 'ru')
  assert.match(message, /Ежедневный отчёт по зарплате/)
  assert.match(message, /📅 29\.07\.2026/)
  assert.match(message, /Здравствуйте, Иван Петров!/)
  assert.match(message, /Спасибо за ваш труд\./)
  assert.match(message, /Статус дня:<\/b> Рабочий день/)
  assert.match(message, /150 000 UZS/)
  assert.match(message, /Бонусы за день:<\/b> 50 000 UZS/)
  assert.match(message, /20 000 UZS/)
  assert.match(message, /Выплачено за день:<\/b> 100 000 UZS/)
  assert.match(message, /Аванс/)
  assert.match(message, /&lt;Good work&gt;/)
  assert.match(message, /&lt;Late arrival&gt;/)
  assert.doesNotMatch(message, /<Good work>/)
  assert.doesNotMatch(message, /<Late arrival>/)
})

test('daily salary message clearly shows a recorded absence and its note', () => {
  const message = buildDailySalaryMessage({
    ...salaryProfile,
    absences: [{ absence_date: '2026-07-29', note: '<Болезнь>' }],
  }, '2026-07-29', 'ru')

  assert.match(message, /Статус дня:<\/b> Отсутствовал — &lt;Болезнь&gt;/)
  assert.match(message, /Начислено за день:<\/b> 0 UZS/)
  assert.doesNotMatch(message, /<Болезнь>/)
})

test('employee start links accept only the expected token shape', () => {
  const token = 'd1d8de7b-80bf-4f82-84b1-341f06356f75'
  assert.equal(parseEmployeeStartToken(`/start employee_${token}`), token)
  assert.equal(parseEmployeeStartToken(`/start@zar_bot employee_${token}`), token)
  assert.equal(parseEmployeeStartToken('/start employee_not-a-token'), '')
})
