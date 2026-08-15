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
    ],
  }], '2026-08-15', 'en')

  assert.match(message, /🧺 <b>Daily Bazaar<\/b>/)
  assert.match(message, /Date: 15 August 2026/)
  assert.match(message, /Tomatoes &lt;red&gt;/)
  assert.match(message, /Quantity: 5 kg · Unit price: 12\D000 UZS \/ kg/)
  assert.match(message, /Oil &amp; spices/)
  assert.match(message, /Quantity: 2 bottle · Unit price: 45\D000 UZS \/ bottle/)
  assert.match(message, /Bazaar total: <b>150\D000 UZS<\/b>/)
})

test('Daily Bazaar selected-date action uses the authenticated shared endpoint and Salary Events target', () => {
  const page = readFileSync(new URL('../src/pages/DailyBazaar.jsx', import.meta.url), 'utf8')
  const endpoint = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')

  assert.match(page, /type: 'daily_bazaar', purchaseDate/)
  assert.match(page, /dateFrom === dateTo/)
  assert.match(page, /sendSelectedDateToTelegram/)
  assert.match(page, /canSendSelectedDate/)
  assert.match(endpoint, /requireBazaarWriteAccess/)
  assert.match(endpoint, /access\?\.includes\('bazaar'\)/)
  assert.match(endpoint, /\.from\('bazaar_purchases'\)/)
  assert.match(endpoint, /\.eq\('purchase_date', purchaseDate\)/)
  assert.match(endpoint, /\.eq\('entry_source', 'daily_bazaar'\)/)
  assert.match(endpoint, /buildDailyBazaarGroupMessage/)
  assert.match(endpoint, /target: 'salary_events'/)
})
