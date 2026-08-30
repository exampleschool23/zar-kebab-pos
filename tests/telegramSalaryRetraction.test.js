import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deleteTelegramMessage } from '../api/telegram/_lib/telegram.js'

test('Telegram salary retraction calls deleteMessage with the tracked destination', async () => {
  const originalFetch = globalThis.fetch
  const originalToken = process.env.TELEGRAM_BOT_TOKEN
  process.env.TELEGRAM_BOT_TOKEN = 'test-token'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ ok: true, result: true }) }
  }

  try {
    await deleteTelegramMessage('-100123', '607')
    assert.match(request.url, /\/bottest-token\/deleteMessage$/)
    assert.deepEqual(JSON.parse(request.options.body), {
      chat_id: '-100123',
      message_id: 607,
    })
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken == null) delete process.env.TELEGRAM_BOT_TOKEN
    else process.env.TELEGRAM_BOT_TOKEN = originalToken
  }
})

test('salary-history deletion retracts Telegram messages before deleting its source row', () => {
  const historyPage = readFileSync(
    new URL('../src/pages/EmployeeSalaryHistory.jsx', import.meta.url),
    'utf8'
  )
  const retractCall = historyPage.indexOf('await retractTelegramSalaryEvent(entry.entryType, entry.id)')
  const sourceDelete = historyPage.indexOf(".from(table)\n      .delete()")

  assert.ok(retractCall >= 0)
  assert.ok(sourceDelete > retractCall)
  assert.match(historyPage, /telegramDeleteFailed/)
})

test('salary retraction covers private, Salary-group, and Team delivery message ids', () => {
  const endpoint = readFileSync(
    new URL('../api/telegram/employee-notification.js', import.meta.url),
    'utf8'
  )

  assert.match(endpoint, /notificationType === 'retract_salary_event'/)
  assert.match(endpoint, /access\.role !== 'owner'/)
  assert.match(endpoint, /employee_telegram_message_id/)
  assert.match(endpoint, /employee_chat_id, telegram_message_id, group_chat_id/)
  assert.match(endpoint, /group_telegram_message_id/)
  assert.match(endpoint, /team_telegram_message_id/)
  assert.match(endpoint, /telegramMessageWasAlreadyDeleted/)
  assert.match(endpoint, /Promise\.allSettled\(uniqueTargets\.map\(retractTrackedTelegramMessage\)\)/)
})

test('payment delivery snapshots the exact employee chat used by the sent message', () => {
  const migration = readFileSync(
    new URL('../supabase/157_salary_payment_employee_chat_tracking.sql', import.meta.url),
    'utf8'
  )
  const dbHealth = readFileSync(new URL('../src/lib/dbHealth.js', import.meta.url), 'utf8')
  const cliHealth = readFileSync(new URL('../scripts/check-db-health.js', import.meta.url), 'utf8')

  assert.match(migration, /add column if not exists employee_chat_id text/i)
  assert.match(migration, /before update of telegram_message_id/i)
  assert.match(migration, /employee_salary_telegram_links/i)
  assert.match(dbHealth, /employee_chat_id/)
  assert.match(dbHealth, /157_salary_payment_employee_chat_tracking/)
  assert.match(cliHealth, /employee_chat_id/)
})
