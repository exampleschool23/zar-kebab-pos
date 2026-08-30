import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  getExpenseEntryMinDate,
  isExpenseEntryDateAllowed,
} from '../src/lib/expenses.js'

const migration = readFileSync(new URL('../supabase/166_expense_backdate_limit.sql', import.meta.url), 'utf8')
const expensesPage = readFileSync(new URL('../src/pages/Expenses.jsx', import.meta.url), 'utf8')
const bazaarPage = readFileSync(new URL('../src/pages/DailyBazaar.jsx', import.meta.url), 'utf8')

test('expense entry allows today and the previous three calendar days only', () => {
  assert.equal(getExpenseEntryMinDate('2026-08-31'), '2026-08-28')
  assert.equal(getExpenseEntryMinDate('2026-03-01'), '2026-02-26')
  assert.equal(isExpenseEntryDateAllowed('2026-08-31', '2026-08-31'), true)
  assert.equal(isExpenseEntryDateAllowed('2026-08-28', '2026-08-31'), true)
  assert.equal(isExpenseEntryDateAllowed('2026-08-27', '2026-08-31'), false)
  assert.match(expensesPage, /min=\{form\.entry_type === 'expense' \? expenseEntryMinDate : undefined\}/)
  assert.match(expensesPage, /entryType === 'expense' && !isExpenseEntryDateAllowed\(form\.expense_date\)/)
  assert.match(bazaarPage, /!form\.id && !isExpenseEntryDateAllowed\(form\.purchase_date\)/)
  assert.match(bazaarPage, /min=\{form\.id \? undefined : expenseEntryMinDate\}/)
})

test('database rejects inserting or moving an expense to a fourth-prior day', () => {
  assert.match(migration, /timezone\('Asia\/Tashkent', now\(\)\)/)
  assert.match(migration, /earliest_allowed date := tashkent_today - 3/)
  assert.match(migration, /new\.entry_type = 'expense'[\s\S]*new\.expense_date < earliest_allowed/)
  assert.match(migration, /before insert or update of expense_date, entry_type on public\.expenses/)
  assert.match(migration, /new\.expense_date is distinct from old\.expense_date/)
  assert.match(migration, /errcode = '22007'/)
})
