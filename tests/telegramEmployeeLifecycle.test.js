import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { buildEmployeeLifecycleInvestorMessage } from '../api/telegram/_lib/investorIncomeMessages.js'

const migration = fs.readFileSync(
  new URL('../supabase/178_employee_lifecycle_investor_notifications.sql', import.meta.url),
  'utf8',
)
const endpoint = fs.readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
const salaries = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
const employees = fs.readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')

test('employee lifecycle messages identify the event, employee, date, and actor', () => {
  const base = {
    employee_name: '<New Employee>',
    effective_date: '2026-09-04',
    actor_name: 'Owner & Manager',
  }
  const created = buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'created' }, 'en')
  const activated = buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'activated' }, 'en')
  const deactivated = buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'deactivated' }, 'en')

  assert.match(created, /New employee added/)
  assert.match(activated, /Employee activated/)
  assert.match(deactivated, /Employee deactivated/)
  assert.match(created, /&lt;New Employee&gt;/)
  assert.match(created, /Owner &amp; Manager/)
  assert.match(created, /4 September 2026/)

  assert.match(buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'created' }, 'ru'), /Добавлен новый сотрудник/)
  assert.match(buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'activated' }, 'ru'), /Сотрудник активирован/)
  assert.match(buildEmployeeLifecycleInvestorMessage({ ...base, event_type: 'deactivated' }, 'ru'), /Сотрудник деактивирован/)
})

test('employee lifecycle transitions queue immutable Investor deliveries at the database boundary', () => {
  assert.match(migration, /event_type in \('created', 'activated', 'deactivated'\)/i)
  assert.match(migration, /after insert or update of is_active on public\.employee_salary_profiles/i)
  assert.match(migration, /old\.is_active is distinct from new\.is_active/i)
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/i)
  assert.match(migration, /status in \('not_attempted', 'pending', 'sent', 'failed', 'skipped'\)/i)
  assert.match(migration, /revoke all on table public\.employee_lifecycle_investor_notification_deliveries from public, anon, authenticated/i)
})

test('both employee management screens request retry-safe lifecycle delivery', () => {
  assert.match(client, /type: 'employee_lifecycle'/)
  assert.match(endpoint, /notifyEmployeeLifecycle/)
  assert.match(endpoint, /buildEmployeeLifecycleInvestorMessage/)
  assert.match(endpoint, /buildEmployeeLifecycleInvestorMessage\(claimed\.data, 'ru'\)/)
  assert.match(endpoint, /loadSalaryGroupTarget/)
  assert.match(endpoint, /\.eq\('actor_id', user\.id\)/)
  assert.match(salaries, /notifyTelegramEmployeeLifecycle\(salaryProfile\.id, 'created'\)/)
  assert.match(salaries, /nextActive \? 'activated' : 'deactivated'/)
  assert.match(employees, /nextActive \? 'activated' : 'deactivated'/)
})
