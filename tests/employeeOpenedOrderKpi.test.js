import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('employee opened-order KPI executes the production finalizer in PostgreSQL', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function current_staff_can_access(text) returns boolean language sql as $$ select true $$;
    create function current_staff_can_write(text) returns boolean language sql as $$ select true $$;
    create function current_staff_has_role(text[]) returns boolean language sql as $$ select true $$;
    -- Freeze the isolated database clock, leaving production SQL unchanged.
    create or replace function pg_catalog.now() returns timestamptz language sql stable
      as $$ select '2026-09-20T12:00:00Z'::timestamptz $$;
    create table profiles(id uuid primary key);
    create table employee_salary_profiles(
      id uuid primary key, profile_id uuid, employee_name text, joined_at date,
      ended_at date, deleted_at timestamptz, payment_method text
    );
    create table employee_salary_absences(salary_profile_id uuid, absence_date date);
    create table employee_salary_bonuses(
      id uuid primary key, salary_profile_id uuid, bonus_date date, amount integer,
      payment_method text, note text, created_by uuid, created_by_name text
    );
    create table orders(
      id text primary key, opened_by uuid, opened_by_name text, paid_by uuid,
      order_type text default 'dine_in', payment_status text default 'paid',
      status text default 'completed', subtotal integer, service_fee integer default 0,
      loyalty_discount_amount integer default 0, paid_at timestamptz, created_at timestamptz
    );
  `)
  await db.exec(sql('129_daily_kpi_bonuses.sql'))
  await db.exec(sql('169_salary_bonus_accrual.sql'))
  for (let n = 1; n <= 7; n++) {
    await db.query(`insert into employee_salary_profiles values($1,$2,$3,'2026-01-01',null,null,'cash')`,
      [id(n), n === 4 ? null : id(n + 100), n === 1 ? 'Zilola' : n === 4 ? 'Zilola' : `Employee ${n}`])
    await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps)
      values($1,'2026-01-01',$2)`, [id(n), n === 2 ? 200 : 100])
  }
  await db.exec(`
    insert into employee_salary_absences values('${id(5)}','2026-09-16');
    update employee_salary_profiles set ended_at='2026-09-15' where id='${id(6)}';
    insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,is_enabled)
      values('${id(7)}','2026-09-16',100,false);
  `)
  const order = async (key, opener, amount, date, overrides = {}) => {
    const row = {
      id: key, opened_by: opener === null ? null : id(opener + 100), opened_by_name: 'Zilola',
      paid_by: id(103), subtotal: amount, paid_at: `${date}T10:00:00+05:00`,
      created_at: '2026-09-01T10:00:00+05:00', ...overrides,
    }
    const keys = Object.keys(row)
    await db.query(`insert into orders(${keys.join(',')}) values(${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row))
  }
  const finalize = async date => (await db.query('select * from generate_daily_kpi_bonuses($1::date)', [date])).rows
  const byEmployee = rows => new Map(rows.map(row => [row.salary_profile_id, row]))
  // Seed an already finalized date under the old function before applying 195.
  await order('old-finalized', 1, 1000000, '2026-09-14')
  const historical = await finalize('2026-09-14')
  await db.exec(sql('195_employee_opened_order_kpi.sql'))
  await db.exec(sql('195_employee_opened_order_kpi.sql'))

  await t.test('migration/retries preserve finalized history and old dates retain restaurant-wide sales', async () => {
    assert.deepEqual(await finalize('2026-09-14'), historical)
    await order('old-catchup', 1, 5500000, '2026-09-15')
    const results = byEmployee(await finalize('2026-09-15'))
    assert.equal(Number(results.get(id(1)).sales_base_amount), 5500000)
    assert.equal(results.get(id(1)).bonus_amount, 55000)
    assert.equal(results.get(id(2)).bonus_amount, 110000)
  })

  await t.test('cutoff uses own opened orders, service and own rate; ignores cashier/name and ineligible sales', async () => {
    await order('zilola-a', 1, 1000000, '2026-09-16', { service_fee: 200000, loyalty_discount_amount: 500000 })
    await order('zilola-b', 1, 1300000, '2026-09-16', { paid_at: '2026-09-15T19:00:00Z' })
    await order('other', 2, 3000000, '2026-09-16')
    await order('unattributed', null, 9000000, '2026-09-16')
    await order('absent', 5, 1000000, '2026-09-16')
    await order('ended', 6, 1000000, '2026-09-16')
    await order('disabled', 7, 1000000, '2026-09-16')
    for (const [key, overrides] of Object.entries({
      unpaid: { payment_status: 'unpaid' }, cancelled: { status: 'cancelled' },
      takeaway: { order_type: 'takeaway' }, delivery: { order_type: 'delivery' },
      game: { order_type: 'game_club' }, undated: { paid_at: null },
      nextDay: { paid_at: '2026-09-16T19:00:00Z' },
    })) await order(key, 1, 99000000, '2026-09-16', overrides)
    const results = byEmployee(await finalize('2026-09-16'))
    assert.equal(Number(results.get(id(1)).sales_base_amount), 2500000)
    assert.equal(results.get(id(1)).bonus_amount, 25000)
    assert.equal(Number(results.get(id(2)).sales_base_amount), 3000000)
    assert.equal(results.get(id(2)).bonus_amount, 60000)
    for (const n of [3, 4]) {
      assert.equal(results.get(id(n)).status, 'skipped_no_sales')
      assert.equal(Number(results.get(id(n)).sales_base_amount), 0)
    }
    assert.equal(results.get(id(5)).status, 'skipped_absent')
    assert.equal(results.get(id(6)).status, 'skipped_ineligible')
    assert.equal(results.has(id(7)), false)
    const bonus = (await db.query('select * from employee_salary_bonuses where id=$1', [results.get(id(1)).bonus_id])).rows[0]
    assert.equal(bonus.accrues_to_salary, true)
    assert.equal(bonus.source_metadata.sales_base_amount, 2500000)
    assert.equal(bonus.source_metadata.sales_basis, 'employee_opened_orders')
    assert.equal(bonus.source_metadata.opened_by, id(101))
    const run = (await db.query("select * from employee_daily_kpi_runs where business_date='2026-09-16'")).rows[0]
    assert.equal(Number(run.sales_base_amount), 17500000)
    assert.equal(run.generated_count, 2)
    assert.equal(run.skipped_count, 4)
  })

  await t.test('retries preserve snapshots after sales changes and never recreate voided bonuses', async () => {
    const before = await finalize('2026-09-16')
    await order('late', 1, 999999, '2026-09-16')
    assert.deepEqual(await finalize('2026-09-16'), before)
    const bonus = byEmployee(before).get(id(1)).bonus_id
    await db.query('delete from employee_salary_bonuses where id=$1', [bonus])
    const after = byEmployee(await finalize('2026-09-16')).get(id(1))
    assert.equal(after.status, 'voided')
    assert.equal(after.bonus_id, null)
    assert.equal(after.bonus_amount, 25000)
    assert.equal((await db.query("select count(*)::int as n from employee_salary_bonuses where bonus_date='2026-09-16'")).rows[0].n, 1)
  })

  await t.test('later dates round per employee, empty days finalize once, and open dates remain rejected', async () => {
    await order('rounding', 2, 123456, '2026-09-17', { order_type: null })
    const results = byEmployee(await finalize('2026-09-17'))
    assert.equal(results.get(id(1)).bonus_amount, 990000) // exact next-day boundary above
    assert.equal(results.get(id(2)).bonus_amount, 2469)
    const empty = await finalize('2026-09-18')
    assert.ok(empty.every(row => row.bonus_amount === 0))
    assert.deepEqual(await finalize('2026-09-18'), empty)
    await assert.rejects(finalize('2026-09-20'), /completed Tashkent date/)
    const access = (await db.query(`select
      has_function_privilege('authenticated','generate_daily_kpi_bonuses(date)','execute') as staff,
      has_function_privilege('service_role','generate_daily_kpi_bonuses(date)','execute') as service`)).rows[0]
    assert.deepEqual(access, { staff: false, service: true })
  })
})
