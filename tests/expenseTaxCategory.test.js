import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { MANUAL_EXPENSE_CATEGORIES, expenseCategoryLabel } from '../src/lib/expenses.js'

const migration = fs.readFileSync(
  new URL('../supabase/137_expense_tax_category.sql', import.meta.url),
  'utf8'
)

test('tax is a localized manual Accounting expense category', () => {
  assert.equal(MANUAL_EXPENSE_CATEGORIES.some(category => category.key === 'tax'), true)
  assert.equal(expenseCategoryLabel('tax', 'uz'), 'Soliq')
  assert.equal(expenseCategoryLabel('tax', 'ru'), 'Налоги')
  assert.equal(expenseCategoryLabel('tax', 'en'), 'Taxes')
})

test('tax expenses are accepted by the database category constraint', () => {
  assert.match(migration, /drop constraint if exists expenses_category_check/)
  assert.match(migration, /add constraint expenses_category_check/)
  assert.match(migration, /'tax'/)
})
