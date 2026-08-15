import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildInvestorIncomeGroupMessage } from '../api/telegram/_lib/investorIncomeMessages.js'

test('investor income Telegram message contains saved accounting details and escapes HTML', () => {
  const message = buildInvestorIncomeGroupMessage({
    amount: 2_500_000,
    expense_date: '2026-08-15',
    payment_method: 'cash',
    vendor: 'Investor <One>',
    description: 'New equipment & repairs',
    created_by_name: 'Owner',
  }, 'en', 12_930_000)

  assert.match(message, /Investor support/)
  assert.match(message, /2\D500\D000 UZS/)
  assert.match(message, /Investor support this month: <b>12\D930\D000 UZS<\/b>/)
  assert.match(message, /Investor &lt;One&gt;/)
  assert.match(message, /New equipment &amp; repairs/)
  assert.match(message, /2\D500\D000 UZS<\/b>\n\nDate:/)
  assert.match(message, /New equipment &amp; repairs\n\nInvestor support this month:/)
  assert.ok(message.indexOf('Investor support this month:') > message.indexOf('New equipment &amp; repairs'))
  assert.doesNotMatch(message, /Recorded by|Оформил|Rasmiylashtirdi/)
  assert.doesNotMatch(message, /New investor support was recorded/)
})

test('new investor income calls the shared authenticated Telegram endpoint and salary target', () => {
  const expenses = readFileSync(new URL('../src/pages/Expenses.jsx', import.meta.url), 'utf8')
  const endpoint = readFileSync(new URL('../api/telegram/employee-notification.js', import.meta.url), 'utf8')

  assert.match(expenses, /type: 'investor_income', expenseId/)
  assert.match(expenses, /await notifyInvestorIncome\(savedExpense\.id\)/)
  assert.match(endpoint, /notifyInvestorIncome/)
  assert.match(endpoint, /loadSalaryGroupTarget\(supabase\)/)
  assert.match(endpoint, /target: 'salary_events'/)
  assert.match(endpoint, /\.eq\('category', 'investor_support'\)/)
  assert.match(endpoint, /currentMonthTotal/)
  assert.match(endpoint, /expense\.entry_type !== 'income'/)
  assert.match(endpoint, /expense\.category !== 'investor_support'/)
})
