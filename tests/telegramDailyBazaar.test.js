import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Investor daily album excludes Bazaar images and retains financial and unclosed reports', () => {
  const page = readFileSync(new URL('../src/pages/DailyBazaar.jsx', import.meta.url), 'utf8')
  const cron = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/131_daily_bazaar_telegram_deliveries.sql', import.meta.url), 'utf8')

  assert.doesNotMatch(page, /Send selected date to Telegram|Отправить выбранную дату в Telegram|sendSelectedDateToTelegram/)
  assert.match(cron, /sendDailyInvestorReportAlbum/)
  assert.doesNotMatch(cron, /claimDailyBazaarDelivery|loadDailyBazaarPurchases|buildDailyBazaarReportPng|buildDailyInvestorReportsCaption/)
  assert.doesNotMatch(cron, /daily_bazaar_telegram_deliveries|zar-kebab-bazaar-/)
  assert.match(cron, /buildDailyPayrollGroupReportPng/)
  assert.match(cron, /buildOpenOrdersReportPng/)
  assert.match(cron, /sendTelegramMediaGroup/)
  assert.match(cron, /getTelegramMediaGroupMessageIds/)
  assert.match(migration, /status in \('pending', 'sent', 'failed', 'skipped'\)/i)
  assert.match(migration, /Historical delivery skipped during migration/)
  assert.match(migration, /purchase\.purchase_date < \(timezone\('Asia\/Tashkent', now\(\)\)\)::date/)
})
