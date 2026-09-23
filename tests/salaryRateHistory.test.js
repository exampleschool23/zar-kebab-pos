import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildSalaryRateHistory } from '../src/lib/salaryRateHistory.js'

test('rate timeline sorts by actual recording time, retains backdated effective dates and resolves authors', () => {
  const rows = buildSalaryRateHistory([
    { id: 'old', created_at: '2026-06-17T07:30:00Z', effective_from: '2026-05-22', amount: 8000000, rate_unit: 'monthly' },
    { id: 'new', created_at: '2026-09-23T09:40:00Z', effective_from: '2026-05-22', amount: 200000, rate_unit: 'daily', created_by: 'actor' },
  ], [], [{ id: 'actor', full_name: 'Manager' }])
  assert.equal(rows[0].after.amount, 200000)
  assert.equal(rows[0].after.effective_from, '2026-05-22')
  assert.equal(rows[0].actor, 'Manager')
  assert.equal(rows[0].audited, false)
})

test('audits preserve before/after and deletion evidence without duplicating saved rates', () => {
  const before = { id: 'rate', amount: 100, effective_from: '2026-09-22' }
  const after = { ...before, amount: 200 }
  const rows = buildSalaryRateHistory([after], [
    { id: 1, entity_id: 'rate', action: 'insert', new_record: before, changed_at: '2026-09-22T00:00:00Z', changed_by_name: 'Original actor' },
    { id: 2, entity_id: 'rate', action: 'update', old_record: before, new_record: after, changed_at: '2026-09-23T00:00:00Z' },
    { id: 3, entity_id: 'deleted', action: 'delete', old_record: before, changed_at: '2026-09-23T01:00:00Z' },
  ])
  assert.equal(rows.length, 3)
  assert.equal(rows[0].action, 'delete')
  assert.deepEqual(rows[1].before, before)
  assert.deepEqual(rows[1].after, after)
  assert.equal(rows[2].actor, 'Original actor')
})

test('salary rate audit migration captures inserts, changes and deletes in immutable accounting history', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create function current_staff_can_access(text) returns boolean language sql as $$select true$$;
    create table profiles(id uuid primary key, full_name text, email text);
    insert into profiles values ('00000000-0000-0000-0000-000000000001','Manager','');
    create table expenses(id text);
    create table employee_salary_payments(id text);
    create table employee_salary_bonuses(id text);
    create table employee_salary_rates(id text, salary_profile_id uuid, amount int, effective_from date);
  `)
  for (const name of ['084_accounting_record_audit.sql', '208_salary_rate_audit.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8'))
  }
  await db.exec(`insert into employee_salary_rates values ('rate','00000000-0000-0000-0000-000000000002',100,'2026-09-23');
    update employee_salary_rates set amount=200;
    delete from employee_salary_rates;`)
  const { rows } = await db.query('select * from accounting_record_audit order by id')
  assert.deepEqual(rows.map(r => r.action), ['insert', 'update', 'delete'])
  assert.equal(rows[1].old_record.amount, 100)
  assert.equal(rows[1].new_record.amount, 200)
  assert.equal(rows[2].old_record.salary_profile_id, '00000000-0000-0000-0000-000000000002')
  assert.equal(rows[2].changed_by_name, 'Manager')
  await assert.rejects(db.exec('delete from accounting_record_audit'), /immutable/)
  await db.exec("insert into expenses values ('expense')")
  assert.equal((await db.query("select count(*)::int n from accounting_record_audit where entity_type='expense'")).rows[0].n, 1)
})
