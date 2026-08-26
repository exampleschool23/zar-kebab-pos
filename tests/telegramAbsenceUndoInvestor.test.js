import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildAbsenceUndoInvestorMessage } from '../api/telegram/_lib/investorIncomeMessages.js'

const migration = readFileSync(new URL('../supabase/148_salary_absence_undo_investor_notifications.sql', import.meta.url), 'utf8')
const endpoint = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')
const employees = readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')
const notifications = readFileSync(new URL('../src/lib/telegramNotifications.js', import.meta.url), 'utf8')
const dbHealth = readFileSync(new URL('../src/lib/dbHealth.js', import.meta.url), 'utf8')
const cliHealth = readFileSync(new URL('../scripts/check-db-health.js', import.meta.url), 'utf8')

test('absence undo Investor message identifies employee, date, and actor safely', () => {
  const message = buildAbsenceUndoInvestorMessage({
    employee_name: 'Ali <Waiter>',
    absence_date: '2026-08-26',
    actor_name: 'Owner & Admin',
  }, 'ru')

  assert.match(message, /✅ <b>Отсутствие отменено<\/b>/)
  assert.match(message, /Ali &lt;Waiter&gt;/)
  assert.match(message, /26 августа 2026/)
  assert.match(message, /Owner &amp; Admin/)
})

test('absence deletion queues one immutable and service-only Investor delivery', () => {
  assert.match(migration, /salary_absence_undo_notification_deliveries/)
  assert.match(migration, /audit_id\s+bigint not null unique/i)
  assert.match(migration, /absence_id\s+uuid not null unique/i)
  assert.match(migration, /new\.entity_type <> 'salary_absence' or new\.action <> 'delete'/i)
  assert.match(migration, /after insert on public\.accounting_record_audit/i)
  assert.match(migration, /target_key[\s\S]*default 'salary_events'/i)
  assert.match(migration, /revoke all on table public\.salary_absence_undo_notification_deliveries from anon, authenticated/i)
})

test('Undo absence requests one duplicate-safe Investor notification after exact deletion', () => {
  const undoBody = employees.slice(
    employees.indexOf('async function undoEmployeeAbsence'),
    employees.indexOf('function startNameEdit')
  )
  assert.match(undoBody, /\.delete\(\)[\s\S]*\.select\('id'\)/)
  assert.match(undoBody, /notifyTelegramAbsenceUndo\(absence\.id\)/)
  assert.match(notifications, /type: 'absence_undo', absenceId/)
  assert.match(endpoint, /notifyAbsenceUndo\(supabase, user, absenceId\)/)
  assert.match(endpoint, /\.eq\('absence_id', absenceId\)[\s\S]*\.eq\('actor_id', user\.id\)/)
  assert.match(endpoint, /delivery\.status === 'sent'[\s\S]*duplicate: true/)
  assert.match(endpoint, /buildAbsenceUndoInvestorMessage\(claimed, target\.language\)/)
})

test('database health requires absence undo Investor delivery tracking', () => {
  assert.match(dbHealth, /salary_absence_undo_notification_deliveries/)
  assert.match(dbHealth, /148_salary_absence_undo_investor_notifications/)
  assert.match(cliHealth, /checkTable\('salary_absence_undo_notification_deliveries'/)
})
