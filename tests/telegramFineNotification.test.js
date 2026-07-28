import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildEmployeeFineMessage } from '../api/telegram/_lib/fineMessages.js'

test('employee fine notification contains persisted details and escapes Telegram HTML', () => {
  const text = buildEmployeeFineMessage({
    employee_name: 'Али <Сотрудник>',
    amount: 150000,
    fine_date: '2026-07-21',
    reason: 'Опоздание & нарушение',
    created_by_name: 'Владелец > Админ',
  })

  assert.match(text, /Уведомление о штрафе/)
  assert.match(text, /Здравствуйте, Али &lt;Сотрудник&gt;!/)
  assert.match(text, /150 000 UZS/)
  assert.match(text, /21\.07\.2026/)
  assert.match(text, /Опоздание &amp; нарушение/)
  assert.match(text, /Владелец &gt; Админ/)
})

test('fine notification endpoint authenticates accounting access and reads the saved fine', () => {
  const api = fs.readFileSync(new URL('../api/telegram/fine-notification.js', import.meta.url), 'utf8')
  const salaries = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')

  assert.match(api, /supabase\.auth\.getUser\(token\)/)
  assert.match(api, /access\?\.includes\('expenses'\)/)
  assert.match(api, /fine\.created_by !== user\.id/)
  assert.match(api, /buildEmployeeFineMessage/)
  assert.match(api, /\.from\('employee_salary_telegram_links'\)/)
  assert.match(api, /\.eq\('salary_profile_id', fine\.salary_profile_id\)/)
  assert.match(api, /sendTelegramMessage\(employeeLink\.chat_id, text\)/)
  assert.doesNotMatch(api, /TELEGRAM_TEAM_CHAT_ID/)
  assert.doesNotMatch(api, /getEmployeeFineChatIds/)
  assert.match(salaries, /\.select\('id'\)\.single\(\)/)
  assert.match(salaries, /notifyTelegramEmployeeFine\(writeResult\.data\?\.id\)/)
})
