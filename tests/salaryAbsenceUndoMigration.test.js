import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/125_audit_salary_absence.sql', import.meta.url),
  'utf8'
)
const cleanupMigration = readFileSync(
  new URL('../supabase/124_cleanup_deleted_salary_notification_deliveries.sql', import.meta.url),
  'utf8'
)

test('salary absence corrections retain an immutable accounting audit snapshot', () => {
  assert.match(migration, /'salary_absence'/)
  assert.match(migration, /when 'employee_salary_absences' then 'salary_absence'/i)
  assert.match(
    migration,
    /create trigger audit_salary_absence_records[\s\S]*after insert or update or delete on public\.employee_salary_absences/i
  )
  assert.match(migration, /public\.capture_accounting_record_audit\(\)/i)
})

test('deleting a salary event removes its polymorphic Telegram delivery row', () => {
  assert.match(cleanupMigration, /cleanup_deleted_salary_event_telegram_delivery/i)
  assert.match(cleanupMigration, /delete from public\.employee_salary_group_notification_deliveries/i)
  assert.match(cleanupMigration, /after delete on public\.employee_salary_bonuses/i)
  assert.match(cleanupMigration, /after delete on public\.employee_salary_fines/i)
  assert.match(cleanupMigration, /after delete on public\.employee_salary_absences/i)
  assert.match(cleanupMigration, /after delete on public\.employee_salary_rates/i)
  assert.match(cleanupMigration, /drop function if exists public\.void_deleted_salary_event_deliveries\(\)/i)
})
