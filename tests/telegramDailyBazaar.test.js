import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Daily Bazaar is sent with the financial report as a two-photo Investor album', () => {
  const page = readFileSync(new URL('../src/pages/DailyBazaar.jsx', import.meta.url), 'utf8')
  const cron = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/131_daily_bazaar_telegram_deliveries.sql', import.meta.url), 'utf8')

  assert.doesNotMatch(page, /Send selected date to Telegram|Отправить выбранную дату в Telegram|sendSelectedDateToTelegram/)
  assert.match(cron, /sendDailyInvestorReportAlbum/)
  assert.match(cron, /const bazaarDate = addSalaryDateDays\(businessDate, -1\)/)
  assert.match(cron, /claimDailyBazaarDelivery\(supabase, bazaarDate\)/)
  assert.match(cron, /loadDailyBazaarPurchases\(supabase, bazaarDate\)/)
  assert.match(cron, /buildDailyBazaarReportPng\(purchases, bazaarDate\)/)
  assert.match(cron, /\.from\('bazaar_purchases'\)/)
  assert.match(cron, /\.eq\('purchase_date', purchaseDate\)/)
  assert.match(cron, /\.eq\('entry_source', 'daily_bazaar'\)/)
  assert.match(cron, /bazaar_purchase_items \([\s\S]*category,[\s\S]*line_total/)
  assert.match(cron, /\.eq\('target_key', 'salary_events'\)/)
  assert.match(cron, /buildDailyBazaarReportPng/)
  assert.match(cron, /zar-kebab-bazaar-/)
  assert.match(cron, /sendTelegramMediaGroup/)
  assert.match(cron, /getTelegramMediaGroupMessageIds/)
  assert.match(cron, /buildDailyInvestorReportsCaption/)
  assert.doesNotMatch(cron, /buildDailyBazaarGroupMessage|Bazaar image unavailable|sending text fallback/)
  assert.match(cron, /daily_bazaar_telegram_deliveries/)
  assert.match(migration, /status in \('pending', 'sent', 'failed', 'skipped'\)/i)
  assert.match(migration, /Historical delivery skipped during migration/)
  assert.match(migration, /purchase\.purchase_date < \(timezone\('Asia\/Tashkent', now\(\)\)\)::date/)
})
