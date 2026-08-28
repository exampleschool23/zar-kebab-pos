import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/152_supabase_daily_report_cron.sql', import.meta.url),
  'utf8'
)

test('Supabase owns the exact 02:30 Tashkent daily report schedule', () => {
  assert.match(migration, /'zar-kebab-daily-reports'/)
  assert.match(migration, /'30 21 \* \* \*'/)
  assert.match(migration, /'select public\.invoke_zar_kebab_daily_reports\(\);'/)
})

test('daily report cron reads authentication from Vault without embedding a secret', () => {
  assert.match(migration, /from vault\.decrypted_secrets/)
  assert.match(migration, /name = 'zar_kebab_daily_report_cron_secret'/)
  assert.match(migration, /'Authorization', 'Bearer ' \|\| cron_secret/)
  assert.doesNotMatch(migration, /CRON_SECRET\s*=/)
})

test('daily report trigger is private and calls only the production endpoint', () => {
  assert.match(migration, /security definer/)
  assert.match(migration, /revoke all on function public\.invoke_zar_kebab_daily_reports\(\) from public/)
  assert.match(migration, /revoke all on function public\.invoke_zar_kebab_daily_reports\(\) from anon/)
  assert.match(migration, /revoke all on function public\.invoke_zar_kebab_daily_reports\(\) from authenticated/)
  assert.match(migration, /url := 'https:\/\/www\.zarkebab\.uz\/api\/telegram\/daily-salary'/)
  assert.match(migration, /timeout_milliseconds := 300000/)
})

test('daily report migration replaces its named schedule idempotently', () => {
  assert.match(migration, /where jobname = 'zar-kebab-daily-reports'/)
  assert.match(migration, /perform cron\.unschedule\(existing_job_id\)/)
  assert.match(migration, /perform cron\.schedule\(/)
})
