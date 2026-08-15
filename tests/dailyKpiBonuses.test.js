import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildSalaryGroupEventMessage,
  buildSalaryTeamEventMessage,
} from '../api/telegram/_lib/paymentMessages.js'
import { buildDailySalaryMessage } from '../api/telegram/_lib/salaryMessages.js'

const migration = fs.readFileSync(
  new URL('../supabase/129_daily_kpi_bonuses.sql', import.meta.url),
  'utf8'
)
const dailyCron = fs.readFileSync(
  new URL('../api/telegram/daily-salary.js', import.meta.url),
  'utf8'
)
const employeeNotification = fs.readFileSync(
  new URL('../api/telegram/employee-notification.js', import.meta.url),
  'utf8'
)
const salariesPage = fs.readFileSync(
  new URL('../src/pages/Salaries.jsx', import.meta.url),
  'utf8'
)

test('daily KPI migration stores effective-dated rules and immutable result snapshots', () => {
  assert.match(migration, /create table if not exists public\.employee_kpi_rules/i)
  assert.match(migration, /rate_bps\s+integer not null[\s\S]*?between 1 and 10000/i)
  assert.match(migration, /unique \(salary_profile_id, effective_from\)/i)
  assert.match(migration, /create table if not exists public\.employee_daily_kpi_runs/i)
  assert.match(migration, /business_date\s+date primary key/i)
  assert.match(migration, /create table if not exists public\.employee_daily_kpi_results/i)
  assert.match(migration, /employee_name_snapshot/i)
  assert.match(migration, /sales_base_amount\s+bigint/i)
  assert.match(migration, /rate_bps\s+integer not null/i)
  assert.match(migration, /bonus_amount\s+integer not null/i)
  assert.match(migration, /unique \(business_date, salary_profile_id\)/i)
  assert.match(migration, /'generated'[\s\S]*?'skipped_absent'[\s\S]*?'skipped_ineligible'[\s\S]*?'skipped_no_sales'[\s\S]*?'voided'/i)
  assert.match(migration, /protect_daily_kpi_finalization/i)
})

test('KPI rule deletion is owner-only and cannot erase a rule used by finalized history', () => {
  assert.match(migration, /create policy "expenses_insert_employee_kpi_rules"[\s\S]*?for insert[\s\S]*?current_staff_can_write\('expenses'\)/i)
  assert.match(migration, /create policy "expenses_update_employee_kpi_rules"[\s\S]*?for update[\s\S]*?current_staff_can_write\('expenses'\)/i)
  assert.match(migration, /create policy "owner_delete_employee_kpi_rules"[\s\S]*?for delete[\s\S]*?current_staff_has_role\(array\['owner'\]\)/i)
  assert.doesNotMatch(migration, /create policy "expenses_write_employee_kpi_rules"[\s\S]*?for all/i)
  assert.match(migration, /create or replace function public\.protect_used_employee_kpi_rule\(\)[\s\S]*?employee_daily_kpi_results[\s\S]*?result\.rule_id = old\.id[\s\S]*?cannot be changed or deleted/i)
  assert.match(migration, /before update or delete on public\.employee_kpi_rules[\s\S]*?protect_used_employee_kpi_rule\(\)/i)
})

test('daily KPI finalization uses paid dine-in subtotal plus service and Tashkent paid time', () => {
  assert.match(migration, /create or replace function public\.generate_daily_kpi_bonuses/i)
  assert.match(migration, /paid_order\.order_type[^\n]*= 'dine_in'/i)
  assert.match(migration, /paid_order\.payment_status = 'paid'/i)
  assert.match(migration, /paid_order\.paid_at is not null/i)
  assert.match(migration, /coalesce\(paid_order\.status, ''\) <> 'cancelled'/i)
  assert.match(migration, /coalesce\(paid_order\.subtotal, 0\)::bigint[\s\S]*?coalesce\(paid_order\.service_fee, 0\)::bigint/i)
  assert.match(migration, /p_business_date::timestamp at time zone 'Asia\/Tashkent'/i)
  assert.match(migration, /round\([\s\S]*?v_sales_base::numeric \* v_rule\.rate_bps::numeric \/ 10000[\s\S]*?\)::bigint/i)
  assert.doesNotMatch(migration, /loyalty_discount_amount[\s\S]*?v_sales_base/i)
})

test('daily KPI finalization is date-idempotent and excludes absent or ineligible employment dates', () => {
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('daily-kpi:' \|\| p_business_date::text\)\)/i)
  assert.match(migration, /if exists \([\s\S]*?employee_daily_kpi_runs[\s\S]*?return query/i)
  assert.match(migration, /employee_salary_absences[\s\S]*?absence_date = p_business_date/i)
  assert.match(migration, /joined_at > p_business_date/i)
  assert.match(migration, /ended_at is not null and v_rule\.ended_at < p_business_date/i)
  assert.match(migration, /timezone\('Asia\/Tashkent', v_rule\.deleted_at\)[\s\S]*?<= p_business_date/i)
  assert.doesNotMatch(migration, /v_rule\.is_active\s*=\s*false/i)
  assert.match(migration, /insert into public\.employee_salary_bonuses/i)
  assert.match(migration, /created_by,[\s\S]*?created_by_name,[\s\S]*?source_type,[\s\S]*?source_metadata/i)
  assert.match(migration, /'Automatic KPI'[\s\S]*?'daily_kpi'[\s\S]*?jsonb_build_object/i)
})

test('automatic bonuses queue group and Team delivery but fold private delivery into the daily summary', () => {
  const queueFunction = migration.slice(
    migration.indexOf('create or replace function public.queue_salary_event_telegram_delivery'),
    migration.indexOf('-- Atomic and idempotent date finalization')
  )
  assert.equal((queueFunction.match(/security definer/gi) || []).length, 1)
  assert.match(queueFunction, /new\.created_by is null[\s\S]*?source_type[\s\S]*?<> 'daily_kpi'[\s\S]*?return new/i)
  assert.match(queueFunction, /employee_status[\s\S]*?team_status/i)
  assert.match(
    queueFunction,
    /tg_argv\[0\] = 'bonus'[\s\S]*?source_type[\s\S]*?= 'daily_kpi'[\s\S]*?then 'skipped'[\s\S]*?else 'not_attempted'/i
  )
  assert.match(queueFunction, /Automatic KPI is included in the combined daily salary summary/i)
  assert.match(
    queueFunction,
    /case when tg_argv\[0\] in \('bonus', 'fine', 'absence'\)[\s\S]*?then 'not_attempted' else 'skipped' end/i
  )
  assert.match(migration, /references public\.employee_salary_bonuses\(id\) on delete set null/i)
  assert.match(migration, /create or replace function public\.void_deleted_daily_kpi_bonus/i)
  assert.match(migration, /set status = 'voided',[\s\S]*?bonus_id = null/i)
})

test('automatic KPI runtime explicitly suppresses the private receipt while retaining group and Team delivery', () => {
  const automaticNotification = employeeNotification.slice(
    employeeNotification.indexOf('export async function notifyAutomaticKpiBonus'),
    employeeNotification.indexOf('async function notifyPayment')
  )
  const hasDirectGroupAndTeamOnly = (
    /deliverSalaryGroupEvent/.test(automaticNotification)
    && /deliverSalaryTeamEvent/.test(automaticNotification)
    && !/deliverEmployeeSalaryEvent/.test(automaticNotification)
  )
  const hasExplicitPrivateOptOut = (
    /notifyLoadedSalaryEvent/.test(automaticNotification)
    && /(?:skipEmployee\s*:\s*true|(?:send|deliver|include|notify)Employee\s*:\s*false)/i
      .test(automaticNotification)
  )

  assert.ok(
    hasDirectGroupAndTeamOnly || hasExplicitPrivateOptOut,
    'automatic KPI delivery must explicitly omit the separate private employee message'
  )
  assert.match(automaticNotification, /source_type !== 'daily_kpi'|source_type === 'daily_kpi'/)
})

test('automatic KPI delivery treats the combined summary as satisfying the employee destination', () => {
  const loadedNotification = employeeNotification.slice(
    employeeNotification.indexOf('async function notifyLoadedSalaryEvent'),
    employeeNotification.indexOf('export async function notifyAutomaticKpiBonus')
  )

  assert.match(loadedNotification, /includeEmployee/)
  assert.match(
    loadedNotification,
    /includeEmployee\s*\?\s*deliverEmployeeSalaryEvent[\s\S]*?:\s*Promise\.resolve\([\s\S]*?status: 'skipped'/
  )
  assert.match(loadedNotification, /employeeSatisfied\s*=\s*!includeEmployee\s*\|\|\s*employeeSent/)
  assert.match(
    loadedNotification,
    /allSent:\s*employeeSatisfied\s*&&\s*groupSent\s*&&\s*\(!teamRequired\s*\|\|\s*teamSent\)/
  )
})

test('Salaries status keeps automatic KPI private delivery terminal while group and Team remain retryable', () => {
  const deliveryRows = salariesPage.slice(
    salariesPage.indexOf('const groupEventDeliveryRows'),
    salariesPage.indexOf('const telegramDeliveryRows')
  )
  const retryDecision = salariesPage.slice(
    salariesPage.indexOf('const canRetry = ['),
    salariesPage.indexOf('return (', salariesPage.indexOf('const canRetry = ['))
  )

  assert.match(
    deliveryRows,
    /employeeIncludedInDailySummary\s*=\s*delivery\.event_type === 'bonus'[\s\S]*?event\?\.source_type === 'daily_kpi'/
  )
  assert.match(retryDecision, /!delivery\.employeeIncludedInDailySummary/)
  assert.match(retryDecision, /\? \[delivery\.employeeStatus\][\s\S]*?: \[\]/)
  assert.match(retryDecision, /delivery\.groupStatus/)
  assert.match(retryDecision, /delivery\.teamStatus/)
})

test('only the server finalizer can create or mutate an automatic KPI bonus', () => {
  const protectionFunction = migration.slice(
    migration.indexOf('create or replace function public.protect_daily_kpi_bonus_source'),
    migration.indexOf('create table if not exists public.employee_kpi_rules')
  )
  assert.match(protectionFunction, /before insert or update on public\.employee_salary_bonuses/i)
  assert.match(protectionFunction, /new\.source_type = 'daily_kpi'[\s\S]*?auth\.uid\(\) is not null/i)
  assert.match(protectionFunction, /new\.created_by is not null/i)
  assert.match(protectionFunction, /old\.source_type = 'daily_kpi' or new\.source_type = 'daily_kpi'/i)
  assert.match(protectionFunction, /Generated daily KPI bonuses are immutable/i)
  assert.doesNotMatch(protectionFunction, /before delete/i)
})

test('daily cron catches up seven completed dates and sends group and Team KPI destinations before the summary', () => {
  assert.match(dailyCron, /const KPI_CATCH_UP_DAYS = 7/)
  assert.match(dailyCron, /getCompletedTashkentDate\(now\)/)
  assert.match(dailyCron, /getCompletedTashkentDates\(now, KPI_CATCH_UP_DAYS\)/)
  assert.match(dailyCron, /supabase\.rpc\('generate_daily_kpi_bonuses'/)
  assert.match(dailyCron, /notifyAutomaticKpiBonus\(supabase, result\.bonus_id\)/)
  assert.match(dailyCron, /existing\.status === 'sent'/)
  assert.match(dailyCron, /existing\.status === 'pending'[\s\S]*?canRetryPending/i)
  assert.ok(
    dailyCron.indexOf('const results = await finalizeDailyKpiDate')
      < dailyCron.indexOf('await sendDailySalaryNotifications')
  )
  assert.match(dailyCron, /const kpiFinalizationFailed = notificationKpiRun\?\.status !== 'completed'/)
  assert.doesNotMatch(dailyCron, /const kpiFinalizationFailed = !kpiUnavailable/)
  assert.match(dailyCron, /for \(const kpiRun of kpiRuns\)/)
  assert.match(dailyCron, /if \(kpiRun\.status !== 'completed'\) continue/)
  assert.match(dailyCron, /sendDailySalaryNotifications\([\s\S]*?kpiRun\.businessDate/)
  assert.match(dailyCron, /const requestFailed = kpiFinalizationFailed \|\| dailySummaryFailed/)
  assert.match(dailyCron, /const responseStatus = requestFailed \? 500 : 200/)
})

test('daily salary catch-up never predates the employee Telegram link', () => {
  const salaryDelivery = dailyCron.slice(
    dailyCron.indexOf('async function sendDailySalaryNotifications'),
    dailyCron.indexOf('export default async function handler')
  )

  assert.match(salaryDelivery, /\.select\('[^']*linked_at[^']*'\)/)
  assert.match(salaryDelivery, /const linkedDate = getOptionalTashkentDate\(link\.linked_at\)/)
  assert.match(salaryDelivery, /if \(linkedDate && linkedDate > notificationDate\)/)
  assert.match(
    dailyCron,
    /function getOptionalTashkentDate\([^)]+\)[\s\S]*?getTashkentDate\(timestamp\)/
  )
})

test('daily salary records sent only after Telegram returns a message id and the ledger update succeeds', () => {
  const salaryDelivery = dailyCron.slice(
    dailyCron.indexOf('async function sendDailySalaryNotifications'),
    dailyCron.indexOf('export default async function handler')
  )
  const messageIdHelper = dailyCron.slice(
    dailyCron.indexOf('function getTelegramMessageId'),
    dailyCron.indexOf('function getOptionalTashkentDate')
  )
  const durableSentHelper = dailyCron.slice(
    dailyCron.indexOf('async function markDailySalaryDeliverySent'),
    dailyCron.indexOf('async function claimDelivery')
  )
  const ledgerUpdateIndex = salaryDelivery.indexOf('await markDailySalaryDeliverySent(')
  const lastNotifiedIndex = salaryDelivery.indexOf('last_notified_at: sentAt')

  assert.match(messageIdHelper, /String\(response\?\.result\?\.message_id \|\| ''\)\.trim\(\)/)
  assert.match(messageIdHelper, /if \(!messageId\) throw new Error\(['"]Telegram did not return a message id['"]\)/)
  assert.match(salaryDelivery, /telegramMessageId = getTelegramMessageId\(response\)/)
  assert.ok(ledgerUpdateIndex >= 0, 'daily salary sent ledger update must exist')
  assert.ok(
    lastNotifiedIndex > ledgerUpdateIndex,
    'best-effort link metadata must update only after the durable sent ledger'
  )
  assert.match(durableSentHelper, /status:\s*'sent'/)
  assert.match(durableSentHelper, /telegram_message_id:\s*telegramMessageId/)
  assert.match(durableSentHelper, /\.select\('id'\)[\s\S]*?\.maybeSingle\(\)/)
  assert.match(durableSentHelper, /if \(!updated\.error && updated\.data\) return/)
  assert.match(durableSentHelper, /throw lastError/)
  assert.doesNotMatch(
    salaryDelivery,
    /Promise\.all\(\[[\s\S]*?employee_salary_notification_deliveries[\s\S]*?last_notified_at/
  )
})

test('last-notified link metadata is best-effort after the daily salary ledger is durable', () => {
  const salaryDelivery = dailyCron.slice(
    dailyCron.indexOf('async function sendDailySalaryNotifications'),
    dailyCron.indexOf('export default async function handler')
  )
  const lastNotifiedIndex = salaryDelivery.indexOf('last_notified_at: sentAt')
  const sentResultIndex = salaryDelivery.indexOf(
    "results.push({ salaryProfileId: link.salary_profile_id, status: 'sent' })"
  )
  const bestEffortBlock = salaryDelivery.slice(lastNotifiedIndex, sentResultIndex)

  assert.ok(lastNotifiedIndex >= 0 && sentResultIndex > lastNotifiedIndex)
  assert.match(bestEffortBlock, /console\.warn/)
  assert.doesNotMatch(bestEffortBlock, /throw\s+/)
})

test('current daily summary exposes per-employee delivery failures as a partial or failed request', () => {
  const summaryFlow = dailyCron.slice(
    dailyCron.indexOf('const dailySummaryRuns = []'),
    dailyCron.indexOf('// Never permanently claim a salary summary')
  )
  const runMarksPartial = (
    /status:\s*failedCount > 0\s*\?\s*'partial'\s*:\s*'completed'/.test(summaryFlow)
    || /status:\s*summaryResults\.some\([\s\S]*?'failed'[\s\S]*?\)\s*\?\s*'partial'/.test(summaryFlow)
  )
  const currentFailureChecksCount = (
    /dailySummaryFailed[\s\S]*?notificationSummaryRun\?\.failedCount\s*>\s*0/.test(summaryFlow)
    || /requestFailed[\s\S]*?notificationSummaryRun\?\.failedCount\s*>\s*0/.test(summaryFlow)
  )

  assert.ok(
    runMarksPartial || currentFailureChecksCount,
    'per-employee failures must not leave the current summary marked completed'
  )
  assert.match(dailyCron, /const responseStatus = requestFailed \? 500 : 200/)
  assert.match(dailyCron, /failedCount:\s*results\.filter\(result => result\.status === 'failed'\)\.length/)
})

test('missing KPI migration or stale schema cache defers and does not claim the daily salary summary', () => {
  const missingMigrationCheck = dailyCron.slice(
    dailyCron.indexOf('function isMissingDailyKpiMigration'),
    dailyCron.indexOf('function isEligibleForSalaryDate')
  )
  const summaryGate = dailyCron.slice(
    dailyCron.indexOf('const notificationKpiRun'),
    dailyCron.indexOf('return json(res, responseStatus')
  )

  assert.match(missingMigrationCheck, /schema cache|could not find/i)
  assert.match(summaryGate, /notificationKpiRun\?\.status !== 'completed'/)
  assert.doesNotMatch(summaryGate, /!kpiUnavailable/)
  assert.match(summaryGate, /if \(kpiRun\.status !== 'completed'\) continue/)
  assert.match(summaryGate, /const requestFailed = kpiFinalizationFailed \|\| dailySummaryFailed/)
  assert.match(summaryGate, /const responseStatus = requestFailed \? 500 : 200/)
})

test('daily KPI migration reloads the PostgREST schema cache after adding its RPC and columns', () => {
  assert.match(migration, /notify\s+pgrst\s*,\s*'reload schema'\s*;/i)
})

test('authenticated retries accept only automatic KPI null-creator bonuses', () => {
  assert.match(employeeNotification, /source_type === 'daily_kpi'/)
  assert.match(employeeNotification, /data\.created_by !== user\.id && !isAutomaticKpiBonus/)
  assert.match(employeeNotification, /export async function notifyAutomaticKpiBonus/)
  assert.match(employeeNotification, /event\.source_type !== 'daily_kpi' \|\| event\.created_by != null/)
  assert.match(employeeNotification, /legacySelect:[\s\S]*?isMissingKpiBonusSourceColumns\(error\)/)
})

test('automatic KPI group announcements show the paid amount, gross base, and configured percentage', () => {
  const event = {
    employee_name: 'Aziz <waiter>',
    bonus_date: '2026-08-14',
    amount: 97_750,
    created_by_name: 'Automatic KPI',
    source_type: 'daily_kpi',
    source_metadata: {
      sales_base_amount: 9_775_000,
      rate_bps: 100,
    },
  }
  const group = buildSalaryGroupEventMessage('bonus', event, 0, 'en')
  const team = buildSalaryTeamEventMessage('bonus', event, 'en')

  for (const message of [group, team]) {
    assert.match(message, /Daily KPI bonus/)
    assert.match(message, /97 750 UZS/)
    assert.match(message, /9 775 000 UZS/)
    assert.match(message, /1%/)
    assert.doesNotMatch(message, /<waiter>/)
  }
  assert.match(group, /Sales base/)
  assert.match(team, /^🎯/)
})

test('one private daily summary contains both salary and the automatic KPI bonus fields', () => {
  const message = buildDailySalaryMessage({
    id: 'salary-waiter-1',
    employee_name: 'Aziz',
    joined_at: '2026-08-01',
    is_active: true,
    rates: [{
      effective_from: '2026-08-01',
      amount: 100_000,
      rate_unit: 'daily',
    }],
    payments: [],
    fines: [],
    absences: [],
    bonuses: [{
      bonus_date: '2026-08-14',
      amount: 97_750,
      payment_method: 'cash',
      note: 'Automatic daily KPI: 1.00% of dine-in subtotal + service (2026-08-14)',
      source_type: 'daily_kpi',
    }],
  }, '2026-08-14', 'en')

  assert.match(message, /Daily salary summary/)
  assert.match(message, /Earned today:<\/b> 100 000 UZS/)
  assert.match(message, /Bonuses today:<\/b> 97 750 UZS/)
  assert.match(message, /Automatic daily KPI: 1\.00% of dine-in subtotal \+ service/)
  assert.equal((message.match(/Daily salary summary/g) || []).length, 1)
})
