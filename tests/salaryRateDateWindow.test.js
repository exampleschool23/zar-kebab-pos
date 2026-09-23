import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { getExpenseEntryMinDate, isExpenseEntryDateAllowed } from '../src/lib/expenses.js'

test('salary date window includes exactly three prior calendar days across months and years', () => {
  for (const [today, minimum, blocked] of [['2026-09-23', '2026-09-20', '2026-09-19'], ['2026-01-02', '2025-12-30', '2025-12-29'], ['2024-03-02', '2024-02-28', '2024-02-27']]) {
    assert.equal(getExpenseEntryMinDate(today), minimum)
    assert.equal(isExpenseEntryDateAllowed(minimum, today), true)
    assert.equal(isExpenseEntryDateAllowed(blocked, today), false)
    assert.equal(isExpenseEntryDateAllowed('', today), false)
  }
})

test('database rejects backdated rates and changes to old rates using Tashkent midnight', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create table employee_salary_rates(id int primary key, effective_from date, amount int);
    insert into employee_salary_rates values (1, '2026-09-19', 100);
    create or replace function pg_catalog.now() returns timestamptz language sql stable as
      $$select '2026-09-22T19:01:00Z'::timestamptz$$;
  `)
  await db.exec(readFileSync(new URL('../supabase/207_salary_rate_date_window.sql', import.meta.url), 'utf8'))
  await db.exec("insert into employee_salary_rates values (2, '2026-09-20', 200), (3, '2026-09-24', 300)")
  for (const query of [
    "insert into employee_salary_rates values (4, '2026-09-19', 400)",
    "update employee_salary_rates set effective_from='2026-09-19' where id=2",
    "update employee_salary_rates set effective_from='2026-09-23' where id=1",
    'update employee_salary_rates set amount=999 where id=1',
  ]) await assert.rejects(db.exec(query), /Salary/)
  await db.exec("update employee_salary_rates set amount=250, effective_from='2026-09-21' where id=2")
  assert.equal((await db.query('select amount from employee_salary_rates where id=1')).rows[0].amount, 100)
})
