import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dailySalary = readFileSync(
  new URL('../api/telegram/daily-salary.js', import.meta.url),
  'utf8'
)
const vercelConfig = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
)

test('daily salary cron reports authorized execution failures to the Investor group', () => {
  assert.match(dailySalary, /if \(cronAuthorized\)/)
  assert.match(dailySalary, /notifyDailySalaryCronFailure\(supabase, notificationDate, error\)/)
  assert.match(dailySalary, /notifySecondaryCronFailure\(supabase, getTashkentDate\(now\), error\)/)
  assert.match(dailySalary, /if \(requestFailed\)[\s\S]*notifyDailySalaryCronFailure/)
  assert.match(dailySalary, /failure alert skipped: Investor group is not configured/)
  assert.match(dailySalary, /CRON_FAILURE_ALERT_MARKER/)
  assert.match(dailySalary, /formatLongDate\(notificationDate, 'ru'/)
  assert.match(dailySalary, /formatLongDate\(businessDate, 'ru'/)
})

test('existing later cron independently checks the daily salary delivery', () => {
  assert.equal(vercelConfig.crons.length, 1)
  assert.equal(
    vercelConfig.crons.some(entry => entry.path === '/api/telegram/daily-salary'),
    false
  )
  const cron = vercelConfig.crons.find(entry => (
    entry.path === '/api/telegram/daily-salary?task=unavailable-products'
  ))
  assert.equal(cron?.schedule, '0 3 * * *')
  assert.match(dailySalary, /verifyDailySalaryCronDelivery\(supabase, notificationDate\)/)
  assert.match(dailySalary, /Promise\.allSettled/)
  assert.match(dailySalary, /daily_payroll_group_notification_deliveries/)
  assert.match(dailySalary, /delivery\?\.status === 'sent'/)
  assert.match(dailySalary, /Ежедневный финансовый отчёт не отправлен/)
  assert.match(dailySalary, /status: 'failed'/)
})

test('watchdog suppresses duplicate alerts and does not alert for an active run', () => {
  assert.match(dailySalary, /dailySalaryRunCanStillBeActive\(delivery\)/)
  assert.match(dailySalary, /status: 'in_progress'/)
  assert.match(dailySalary, /status: 'alert_already_sent'/)
  assert.match(dailySalary, /CRON_FAILURE_ALERT_MARKER/)
})

test('manual Investor report task sends the financial and Bazaar photo album from finalized KPI data', () => {
  assert.match(dailySalary, /cronTask === 'investor-report'/)
  assert.match(dailySalary, /\.from\('employee_daily_kpi_results'\)[\s\S]*?\.eq\('business_date', notificationDate\)/)
  assert.match(dailySalary, /sendDailyInvestorReportAlbum\([\s\S]*?notificationDate,[\s\S]*?kpiResults \|\| \[\]/)
  assert.doesNotMatch(dailySalary, /import \{[\s\S]*buildDailyPayrollGroupReportPng[\s\S]*\} from '\.\/_lib\/payrollReportImage\.js'/)
  assert.match(dailySalary, /await import\('\.\/_lib\/payrollReportImage\.js'\)/)
  assert.match(dailySalary, /sendTelegramMediaGroup\(target\.chatId, photos\)/)
  assert.match(dailySalary, /payroll:[\s\S]*?bazaar:/)
  assert.equal(
    vercelConfig.functions?.['api/telegram/daily-salary.js']?.includeFiles,
    '{node_modules/@img/sharp-libvips-linux-x64/**,node_modules/notosans-fontface/fonts/*.ttf}'
  )
})
