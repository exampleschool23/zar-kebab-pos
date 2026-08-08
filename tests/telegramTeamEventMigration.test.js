import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/119_salary_event_team_notifications.sql', import.meta.url),
  'utf8'
)

test('ZarKebab Team salary events use their own configured destination and delivery state', () => {
  assert.match(migration, /insert into public\.telegram_notification_targets/i)
  assert.match(migration, /'team_events'/)
  assert.match(migration, /'-1003706661399'/)
  assert.match(migration, /on conflict \(target_key\) do nothing/i)

  for (const column of [
    'team_status',
    'team_chat_id',
    'team_telegram_message_id',
    'team_error_message',
    'team_attempted_at',
    'team_sent_at',
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`, 'i'))
  }

  assert.match(
    migration,
    /check \(team_status in \('not_attempted', 'pending', 'sent', 'failed', 'skipped'\)\)/i
  )
})

test('existing salary events cannot be retroactively broadcast to ZarKebab Team', () => {
  assert.match(
    migration,
    /update public\.employee_salary_group_notification_deliveries[\s\S]*?team_status = coalesce\(team_status, 'skipped'\)/i
  )
  assert.match(migration, /when event_type = 'rate'/i)
  assert.match(migration, /does not apply to salary rate changes/i)
  assert.match(migration, /delivery was introduced after this event/i)
  assert.match(migration, /alter column team_status set default 'skipped'/i)
})

test('new bonus, fine, and absence rows queue Team delivery database-first', () => {
  assert.match(migration, /create or replace function public\.queue_salary_event_telegram_delivery\(\)/i)
  assert.match(
    migration,
    /insert into public\.employee_salary_group_notification_deliveries \([\s\S]*?team_status,[\s\S]*?team_error_message,[\s\S]*?team_attempted_at[\s\S]*?\) values \(/i
  )
  assert.ok((migration.match(/'not_attempted'/g) || []).length >= 4)
  assert.match(migration, /on conflict \(event_type, event_id\) do nothing/i)
  assert.doesNotMatch(migration, /employee_salary_payments/i)
  assert.doesNotMatch(migration, /queue_salary_rate_change_telegram_delivery/i)
})
