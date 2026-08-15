import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDailyBazaarGroupMessage } from '../api/telegram/_lib/dailyBazaarMessages.js'

test('Daily Bazaar Telegram message lists product quantity unit price and date total', () => {
  const message = buildDailyBazaarGroupMessage([{
    purchase_date: '2026-08-15',
    entry_source: 'daily_bazaar',
    bazaar_purchase_items: [
      { product_name: 'Tomatoes <red>', quantity: 5, unit: 'kg', line_total: 60_000, sort_order: 0 },
      { product_name: 'Oil & spices', quantity: 2, unit: 'bottle', line_total: 90_000, sort_order: 1 },
      { product_name: 'Chicken', quantity: 6700, unit: 'g', line_total: 247_900, sort_order: 2 },
    ],
  }], '2026-08-15', 'en')

  assert.match(message, /🧺 <b>Daily Bazaar<\/b>/)
  assert.match(message, /Date: 15 August 2026/)
  assert.match(message, /Tomatoes &lt;red&gt;/)
  assert.match(message, /Quantity: 5 kg · Unit price: 12\D000 UZS \/ kg/)
  assert.match(message, /Oil &amp; spices/)
  assert.match(message, /Quantity: 2 bottle · Unit price: 45\D000 UZS \/ bottle/)
  assert.match(message, /Quantity: 6\.7 kg · Unit price: 37\D000 UZS \/ kg/)
  assert.match(message, /Bazaar total: <b>397\D900 UZS<\/b>/)
})

test('Daily Bazaar is sent automatically by the salary cron to the Salary Events target', () => {
  const page = readFileSync(new URL('../src/pages/DailyBazaar.jsx', import.meta.url), 'utf8')
  const cron = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/131_daily_bazaar_telegram_deliveries.sql', import.meta.url), 'utf8')

  assert.doesNotMatch(page, /Send selected date to Telegram|Отправить выбранную дату в Telegram|sendSelectedDateToTelegram/)
  assert.match(cron, /sendDailyBazaarNotification\(supabase, kpiRun\.businessDate\)/)
  assert.match(cron, /\.from\('bazaar_purchases'\)/)
  assert.match(cron, /\.eq\('purchase_date', purchaseDate\)/)
  assert.match(cron, /\.eq\('entry_source', 'daily_bazaar'\)/)
  assert.match(cron, /\.eq\('target_key', 'salary_events'\)/)
  assert.match(cron, /buildDailyBazaarGroupMessage/)
  assert.match(cron, /daily_bazaar_telegram_deliveries/)
  assert.match(migration, /status in \('pending', 'sent', 'failed', 'skipped'\)/i)
  assert.match(migration, /Historical delivery skipped during migration/)
  assert.match(migration, /purchase\.purchase_date < \(timezone\('Asia\/Tashkent', now\(\)\)\)::date/)
})
