import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildDailySalaryMessage,
  getDailySalaryNotificationSummary,
  getTashkentDate,
  parseEmployeeStartToken,
} from '../api/telegram/_lib/salaryMessages.js'
import { buildEmployeePaymentMessage } from '../api/telegram/_lib/paymentMessages.js'

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

test('salary payment notification includes the saved payment and remaining due', () => {
  const message = buildEmployeePaymentMessage({
    employee_name: 'Зилола <кассир>',
    paid_date: '2026-07-29',
    amount: 300_000,
    payment_method: 'cash',
    note: '<Аванс>',
    created_by_name: 'Jasurbek & Co',
  }, 200_000, 'ru')

  assert.match(message, /Выплата зарплаты/)
  assert.match(message, /Зилола &lt;кассир&gt;/)
  assert.match(message, /Выплачено:<\/b> 300 000 UZS/)
  assert.match(message, /Дата выплаты:<\/b> 29\.07\.2026/)
  assert.match(message, /Наличные/)
  assert.match(message, /&lt;Аванс&gt;/)
  assert.match(message, /Осталось к выплате:<\/b> 200 000 UZS/)
  assert.match(message, /Jasurbek &amp; Co/)
  assert.doesNotMatch(message, /<Аванс>/)
})

test('recorded salary payments trigger the authenticated Telegram payment endpoint', () => {
  const salariesPage = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
  const notifications = fs.readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')

  assert.match(salariesPage, /\.select\('id'\)\.single\(\)/)
  assert.match(salariesPage, /notifyTelegramEmployeePayment\(writeResult\.data\?\.id\)/)
  assert.match(notifications, /\/api\/telegram\/employee-notification/)
  assert.match(notifications, /type: 'payment'/)
  assert.match(endpoint, /payment\.created_by !== user\.id/)
  assert.match(endpoint, /buildEmployeePaymentMessage/)
  assert.match(endpoint, /employee_salary_telegram_links/)
})

test('salary payment notifications persist delivery status and employee confirmation', () => {
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const webhook = fs.readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')
  const salariesPage = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
  const migration = fs.readFileSync(new URL('../supabase/108_employee_salary_payment_notification_deliveries.sql', import.meta.url), 'utf8')

  assert.match(endpoint, /employee_salary_payment_notification_deliveries/)
  assert.match(endpoint, /salary_payment_confirm:\$\{deliveryId\}/)
  assert.match(endpoint, /telegram_message_id/)
  assert.match(endpoint, /status: 'failed'/)
  assert.match(webhook, /handleSalaryPaymentConfirmation/)
  assert.match(webhook, /confirmed_by_telegram_user_id/)
  assert.match(webhook, /editMessageReplyMarkup/)
  assert.match(salariesPage, /telegramDeliveryTitle/)
  assert.match(salariesPage, /paymentDeliveryStatusClasses/)
  assert.match(migration, /unique\s+references public\.employee_salary_payments|payment_id\s+uuid not null unique/)
  assert.match(migration, /'confirmed'/)
})

test('employee salary notifications share one endpoint within the Hobby function limit', () => {
  const notifications = fs.readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
  const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
  const apiRoot = new URL('../api/', import.meta.url)

  function countApiFunctions(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
      if (entry.name === '_lib') return total
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
      if (entry.isDirectory()) return total + countApiFunctions(child)
      return total + (entry.name.endsWith('.js') ? 1 : 0)
    }, 0)
  }

  assert.equal((notifications.match(/\/api\/telegram\/employee-notification/g) || []).length, 2)
  assert.match(endpoint, /notificationType === 'fine'/)
  assert.match(endpoint, /notifyPayment\(supabase, user, paymentId\)/)
  assert.equal(fs.existsSync(new URL('../api/telegram/fine-notification.js', import.meta.url)), false)
  assert.equal(fs.existsSync(new URL('../api/telegram/payment-notification.js', import.meta.url)), false)
  assert.ok(countApiFunctions(apiRoot) <= 12)
})

test('daily salary message clearly shows a recorded absence and its note', () => {
  const message = buildDailySalaryMessage({
    ...salaryProfile,
    absences: [{ absence_date: '2026-07-29', note: '<Болезнь>' }],
  }, '2026-07-29', 'ru')

  assert.match(message, /Статус дня:<\/b> Отсутствовал — &lt;Болезнь&gt;/)
  assert.doesNotMatch(message, /Начислено за день/)
  assert.doesNotMatch(message, /<Болезнь>/)
})

test('daily salary message omits every zero-value money section including amount due', () => {
  const message = buildDailySalaryMessage({
    id: 'salary-zero',
    employee_name: 'Новый сотрудник',
    joined_at: '2026-07-29',
    is_active: true,
    rates: [{ effective_from: '2026-07-29', amount: 150_000, rate_unit: 'daily' }],
    payments: [],
    bonuses: [],
    fines: [],
    absences: [{ absence_date: '2026-07-29', note: 'Болезнь' }],
  }, '2026-07-29', 'ru')

  assert.match(message, /Здравствуйте, Новый сотрудник!/)
  assert.match(message, /Статус дня:<\/b> Отсутствовал — Болезнь/)
  assert.doesNotMatch(message, /Начислено за день/)
  assert.doesNotMatch(message, /Бонусы за день/)
  assert.doesNotMatch(message, /Штрафы за день/)
  assert.doesNotMatch(message, /Выплачено за день/)
  assert.doesNotMatch(message, /К выплате/)
  assert.doesNotMatch(message, /0 UZS/)
})

test('employee start links accept only the expected token shape', () => {
  const token = 'd1d8de7b-80bf-4f82-84b1-341f06356f75'
  assert.equal(parseEmployeeStartToken(`/start employee_${token}`), token)
  assert.equal(parseEmployeeStartToken(`/start@zar_bot employee_${token}`), token)
  assert.equal(parseEmployeeStartToken('/start employee_not-a-token'), '')
})

test('employee linking sends the current Tashkent salary status after confirmation', () => {
  const webhook = fs.readFileSync(new URL('../api/telegram/webhook.js', import.meta.url), 'utf8')
  assert.match(webhook, /loadSalaryProfiles\(supabase, \[link\.salary_profile_id\]\)/)
  assert.match(webhook, /buildDailySalaryMessage\(salaryProfile, getTashkentDate\(\), 'ru'\)/)
  assert.match(webhook, /Текущий статус/)
  assert.match(webhook, /linkedMessage\(\)/)
})

test('current employee status uses the Tashkent calendar date', () => {
  assert.equal(getTashkentDate(new Date('2026-07-28T18:59:59Z')), '2026-07-28')
  assert.equal(getTashkentDate(new Date('2026-07-28T19:00:00Z')), '2026-07-29')
})

test('daily salary cron targets 22:30 Tashkent and reports the current day', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const dailySalaryCron = vercelConfig.crons.find(cron => cron.path === '/api/telegram/daily-salary')
  const dailySalaryEndpoint = fs.readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')

  assert.equal(dailySalaryCron?.schedule, '30 17 * * *')
  assert.match(dailySalaryEndpoint, /const notificationDate = getTashkentDate\(\)/)
  assert.doesNotMatch(dailySalaryEndpoint, /completedTashkentDate/)
})
