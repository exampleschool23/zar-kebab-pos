import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildTeamDailyKpiImageSvg } from '../api/telegram/_lib/employeePayrollImages.js'
import { buildEmployeePayrollCalendar } from '../api/telegram/_lib/employeePayrollCalendar.js'
import { buildKpiRuleGroupMessage } from '../api/telegram/_lib/paymentMessages.js'
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
    create table profiles(id uuid primary key, full_name text);
    create table employee_salary_group_notification_deliveries(
      event_type text, event_id uuid, salary_profile_id uuid, status text,
      error_message text, attempted_at timestamptz, employee_status text,
      employee_error_message text, employee_attempted_at timestamptz,
      team_status text, team_error_message text, team_attempted_at timestamptz,
      unique(event_type,event_id)
    );
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
  await db.exec(sql('170_kpi_rule_group_notifications.sql'))
  for (let n = 101; n <= 107; n++) await db.query('insert into profiles values($1,$2)', [id(n), `Account ${n}`])
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

  await t.test('configurable basis supports unlinked managers and explicit waiter accounts without rewriting history', async () => {
    const before = await finalize('2026-09-17')
    await db.exec(sql('196_configurable_kpi_sales_basis.sql'))
    await db.exec(sql('196_configurable_kpi_sales_basis.sql'))
    assert.deepEqual(await finalize('2026-09-17'), before)
    await assert.rejects(db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps)
      values($1,'2026-09-19',100)`, [id(4)]), /Select a POS account/)
    await assert.rejects(db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis)
      values($1,'2026-09-19',100,'invalid')`, [id(4)]), /check constraint/)
    // Unlinked hostess earns from the restaurant; cashier uses an explicitly
    // selected opener account rather than the salary-profile account.
    await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,created_by)
      values($1,'2026-09-19',100,'restaurant',$2)`, [id(4),id(101)])
    await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,order_opener_profile_id)
      values($1,'2026-09-19',100,$2)`, [id(3),id(102)])
    for (const n of [5,6,7]) await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,is_enabled)
      values($1,'2026-09-19',100,'restaurant',$2)`, [id(n),n!==7])
    await db.query("insert into employee_salary_absences values($1,'2026-09-19')",[id(5)])
    await order('own-19',1,2500000,'2026-09-19')
    await order('other-19',2,3000000,'2026-09-19')
    await order('no-opener-19',null,500000,'2026-09-19')
    await order('takeaway-19',1,90000000,'2026-09-19',{order_type:'takeaway'})

    // Changes to only the basis/account create events; identical saves do not.
    await db.query(`insert into employee_kpi_rules(salary_profile_id,effective_from,rate_bps,sales_basis,created_by)
      values($1,'2026-09-19',100,'restaurant',$2)`, [id(1),id(101)])
    await db.query(`update employee_kpi_rules set sales_basis='employee_opened_orders',order_opener_profile_id=$1
      where salary_profile_id=$2 and effective_from='2026-09-19'`,[id(101),id(1)])
    let event = (await db.query(`select e.* from employee_kpi_rule_change_events e join employee_kpi_rules r
      on r.last_change_event_id=e.id where r.salary_profile_id=$1 and r.effective_from='2026-09-19'`,[id(1)])).rows[0]
    assert.equal(event.previous_sales_basis,'restaurant')
    assert.equal(event.new_sales_basis,'employee_opened_orders')
    assert.equal(event.new_order_opener_name,'Account 101')
    assert.match(buildKpiRuleGroupMessage(event,'en'),/All dine-in orders → Own opened orders/)
    const count = async () => (await db.query('select count(*)::int n from employee_kpi_rule_change_events')).rows[0].n
    const n = await count()
    await db.query(`update employee_kpi_rules set sales_basis=sales_basis where salary_profile_id=$1 and effective_from='2026-09-19'`,[id(1)])
    assert.equal(await count(),n)
    await db.query(`update employee_kpi_rules set order_opener_profile_id=$1 where salary_profile_id=$2 and effective_from='2026-09-19'`,[id(102),id(1)])
    assert.equal(await count(),n+1)
    await db.query(`update employee_kpi_rules set order_opener_profile_id=$1 where salary_profile_id=$2 and effective_from='2026-09-19'`,[id(101),id(1)])

    // Reproduce the production drift: an older English guard rejects the
    // current Russian finalizer label. Failed finalization must remain atomic.
    const guard = sql('129_daily_kpi_bonuses.sql').match(
      /create or replace function public\.protect_daily_kpi_bonus_source\(\)[\s\S]*?\$\$;/,
    )[0]
    await db.exec(guard.replace('Автоматический KPI', 'Automatic KPI'))
    await assert.rejects(finalize('2026-09-19'), /only by the automatic finalizer/)
    assert.equal((await db.query("select count(*)::int n from employee_daily_kpi_runs where business_date='2026-09-19'")).rows[0].n, 0)
    assert.equal((await db.query("select count(*)::int n from employee_salary_bonuses where bonus_date='2026-09-19'")).rows[0].n, 0)
    await db.exec(sql('200_repair_daily_kpi_creator_guard.sql'))
    await db.exec(sql('200_repair_daily_kpi_creator_guard.sql'))
    assert.deepEqual(await finalize('2026-09-17'), before)
    for (const label of ['Automatic KPI', null]) {
      await assert.rejects(db.query(`insert into employee_salary_bonuses
        (id,salary_profile_id,bonus_date,amount,source_type,created_by_name)
        values(gen_random_uuid(),$1,'2026-09-19',1,'daily_kpi',$2)`, [id(1),label]), /only by the automatic finalizer/)
    }
    await assert.rejects(db.query(`insert into employee_salary_bonuses
      (id,salary_profile_id,bonus_date,amount,source_type,created_by_name,created_by)
      values(gen_random_uuid(),$1,'2026-09-19',1,'daily_kpi','Автоматический KPI',$2)`, [id(1),id(101)]), /only by the automatic finalizer/)
    await db.exec(`create or replace function auth.uid() returns uuid language sql as $$ select '${id(101)}'::uuid $$`)
    await assert.rejects(finalize('2026-09-19'), /only by the automatic finalizer/)
    await db.exec('create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$')
    const finalized = await finalize('2026-09-19')
    assert.deepEqual(await finalize('2026-09-19'), finalized)
    const results = byEmployee(finalized)
    assert.equal(results.get(id(1)).bonus_amount,25000)
    assert.equal(results.get(id(2)).bonus_amount,60000)
    assert.equal(results.get(id(3)).bonus_amount,30000)
    assert.equal(results.get(id(4)).bonus_amount,60000)
    assert.equal(results.get(id(5)).status,'skipped_absent')
    assert.equal(results.get(id(6)).status,'skipped_ineligible')
    assert.equal(results.has(id(7)),false)
    assert.equal(Number(results.get(id(4)).sales_base_amount),6000000)
    const bonuses = (await db.query("select * from employee_salary_bonuses where bonus_date='2026-09-19'")).rows
    const hostess = bonuses.find(b=>b.salary_profile_id===id(4))
    await assert.rejects(db.query('update employee_salary_bonuses set amount=amount+1 where id=$1',[hostess.id]), /immutable/)
    assert.equal(hostess.source_metadata.sales_basis,'restaurant')
    assert.equal(hostess.source_metadata.opened_by,null)
    const items = bonuses.map(b=>({employee_name:b.salary_profile_id,amount:b.amount}))
    assert.match(buildTeamDailyKpiImageSvg('2026-09-19',items),/175\s000/)
    assert.equal(buildEmployeePayrollCalendar({joined_at:'2026-09-19',bonuses:[{...hostess,bonus_date:'2026-09-19'}]},'2026-09-19').totals.kpi,60000)
    await assert.rejects(db.query(`update employee_kpi_rules set sales_basis='restaurant' where id=$1`,[results.get(id(1)).rule_id]),/finalized day/)
    assert.deepEqual(byEmployee(await finalize('2026-09-19')),results)
  })

  await t.test('same-day deletion reduces own and restaurant awards; finalized orders cannot be deleted', async () => {
    await db.exec(`
      create schema vault; create schema extensions; create schema net; create schema cron;
      create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);
      create table cron.job(jobid bigint,jobname text);
      create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
      create table employee_salary_telegram_links(salary_profile_id uuid,chat_id text,notifications_enabled boolean);
      create or replace function pg_catalog.clock_timestamp() returns timestamptz language sql as
        $$select current_setting('test.deletion_clock')::timestamptz$$;
      select set_config('test.deletion_clock','2026-09-20T12:00:00Z',false);
      alter table orders add column order_number integer, add column total integer;
    `)
    await db.exec(sql('197_employee_order_kpi_notifications.sql'))
    await db.exec(sql('198_employee_order_kpi_running_total.sql'))
    await db.exec(sql('202_current_day_order_deletion.sql'))
    await order('delete-today',1,1000000,'2026-09-20')
    await order('keep-today',1,2000000,'2026-09-20',{service_fee:100000})
    await order('other-today',2,500000,'2026-09-20')
    await db.query("delete from orders where id='delete-today'")
    await db.exec(`create or replace function pg_catalog.now() returns timestamptz language sql stable
      as $$select '2026-09-21T12:00:00Z'::timestamptz$$;
      select set_config('test.deletion_clock','2026-09-21T12:00:00Z',false)`)
    const results = await finalize('2026-09-20')
    assert.equal(byEmployee(results).get(id(1)).bonus_amount,21000)
    assert.equal(byEmployee(results).get(id(4)).bonus_amount,26000)
    const bonuses = (await db.query("select * from employee_salary_bonuses where bonus_date='2026-09-20' order by id")).rows
    await assert.rejects(db.query("delete from orders where id='keep-today'"), /Only orders from today/)
    assert.deepEqual(await finalize('2026-09-20'),results)
    assert.deepEqual((await db.query("select * from employee_salary_bonuses where bonus_date='2026-09-20' order by id")).rows,bonuses)
  })

})
