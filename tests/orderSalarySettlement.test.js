import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { summarizeExpenseCashflow, buildSalaryPaymentExpenseRows, getSalaryBalance } from '../src/lib/expenses.js'
import { getDailyCloseout, closeoutToCsv } from '../src/lib/closeout.js'
import { buildEmployeePaymentMessage } from '../api/telegram/_lib/paymentMessages.js'
import { buildCompletedOrderGroupMessage } from '../api/telegram/_lib/orderStatusMessages.js'
const sql = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('salary settlement atomically preserves loyalty, cash, authorization and durable retries', async t => {
 const db = new PGlite(); t.after(() => db.close())
 await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$ select '${id(1)}'::uuid $$;
 create function current_staff_can_write(text) returns boolean language sql as $$ select coalesce(current_setting('test.allowed',true),'yes')='yes' and $1='delete_paid_orders' $$;
 create table profiles(id uuid primary key,full_name text,email text);
 insert into profiles values('${id(1)}','Delegated cashier','staff@test');
 create table employee_salary_profiles(id uuid primary key,employee_name text,is_active boolean default true,deleted_at timestamptz);
 insert into employee_salary_profiles values('${id(2)}','Employee',true,null);
 create table employee_salary_payments(id uuid primary key,salary_profile_id uuid,paid_date date,amount integer,payment_method text check(payment_method in ('cash','card','terminal')),note text,created_by uuid,created_by_name text);
 create table employee_salary_payment_notification_deliveries(payment_id uuid,group_status text,group_error_message text);
 create table restaurant_tables(id text primary key,status text,reserved_for_name text,reserved_for_phone text,reserved_at timestamptz,reserved_until timestamptz,reservation_notes text);
 create table orders(id text primary key,order_number text,table_id text,order_type text default 'take_away',status text default 'sent',payment_status text default 'unpaid',paid_at timestamptz,created_at timestamptz default now(),updated_at timestamptz,
 subtotal integer,total integer,service_fee integer,service_rate_pct integer default 0,discounted_subtotal integer,loyalty_discount_pct integer,loyalty_discount_amount integer,loyalty_used_amount integer,loyalty_redeem_amount integer,loyalty_card_number text,cashback_earned integer,cashback_percent integer,payment_method text);
 create table menu_items(id text primary key,show_in_cashier_quick_items boolean);
 create table order_items(id text primary key,order_id text,menu_item_id text,unit_price integer,price integer,quantity numeric,status text,is_counter_item boolean,item_type text);
 create table order_payments(id uuid default gen_random_uuid() primary key,order_id text references orders(id) on delete cascade,method text check(method in ('cash','card','terminal','qr','loyalty_card','other')),amount integer,created_by uuid,created_at timestamptz);
 create table loyalty_cards(id uuid primary key,card_number text,is_active boolean,balance integer,cashback_type text,customer_name text,phone_number text,total_earned integer default 0,total_redeemed integer default 0,updated_at timestamptz);
 create table loyalty_transactions(id uuid default gen_random_uuid(),loyalty_card_id uuid,order_id text,type text,amount integer,balance_before integer,balance_after integer,reason text,created_by uuid,card_number_at_transaction text,customer_name_at_transaction text,phone_number_at_transaction text,created_at timestamptz,cashback_percent_used integer,card_type_at_transaction text);
 insert into loyalty_cards values('${id(3)}','123',true,10000,'gold','Card Owner','',0,0,null);
 create function get_accounting_paid_order_summary(date,date) returns jsonb language sql as $$
 with payment_totals as (select method,sum(amount) amount from order_payments where method in ('cash', 'card', 'terminal', 'qr', 'loyalty_card') group by method)
 select jsonb_build_object('payment_method_income', jsonb_build_object('cash',coalesce((select amount from payment_totals where method='cash'),0))) $$;
 `)
 const base = sql('083_atomic_order_payment_settlement.sql')
 const start = base.indexOf('create or replace function public.settle_orders_payment(payload jsonb)')
 await db.exec(base.slice(start).replaceAll('public.settle_orders_payment(', 'public.settle_orders_payment_strict('))
 await db.exec(sql('135_reconcile_cashier_quick_items_before_payment.sql'))
 await db.exec(sql('210_order_salary_settlement.sql'))
 const seed = async key => db.exec(`insert into orders(id,order_number) values('${key}','GC-${key}'); insert into order_items(id,order_id,price,quantity) values('${key}','${key}',40000,1);`)
 await seed('one')
 const payload = {request_id:id(10),salary_profile_id:id(2),expected_order_ids:['one'],order_id:'one',table_id:null,payments:[{method:'salary',amount:30000}],loyalty_card_number:'123',loyalty_used_amount:10000}
 const settle = async p => (await db.query('select settle_orders_payment($1::jsonb) result',[JSON.stringify(p)])).rows[0].result
 const first = await settle(payload)
 assert.equal(first.total_due,30000); assert.equal(first.cashback_earned,2100)
 assert.equal((await db.query('select balance from loyalty_cards')).rows[0].balance,2100)
 assert.deepEqual(await settle(payload),first)
 assert.equal((await db.query('select count(*)::int n from employee_salary_payments')).rows[0].n,1)
 assert.equal((await db.query("select count(*)::int n from order_payments where method in ('cash','terminal')")).rows[0].n,0)
 assert.equal((await db.query('select amount from employee_salary_payments')).rows[0].amount,30000)
 await assert.rejects(settle({...payload,payments:[{method:'salary',amount:40000}]}),/request changed/)
 await assert.rejects(db.exec("delete from orders where id='one'"),/linked payroll reversal/)
 await assert.rejects(db.exec("update order_payments set method='cash' where method='salary'"),/cannot be corrected/)
 await assert.rejects(db.exec('delete from employee_salary_payments'),/cannot be edited or deleted/)
 await assert.rejects(db.exec(`insert into employee_salary_payments(id,amount,payment_method) values('${id(20)}',100,'salary')`),/atomic settlement/)
 await seed('two')
 const second={...payload,request_id:id(11),order_id:'two',expected_order_ids:['two'],loyalty_used_amount:0,payments:[{method:'salary',amount:40000}]}
 await db.exec("set test.allowed='no'")
 await assert.rejects(settle(second),/access is required/)
 await assert.rejects(db.query('select * from get_order_salary_employees()'),/access is required/)
 await db.exec("set test.allowed='yes'")
 assert.deepEqual((await db.query('select * from get_order_salary_employees()')).rows,[{id:id(2),employee_name:'Employee'}])
 await assert.rejects(settle({...second,expected_order_ids:['two','different']}),/bill changed/)
 assert.equal((await db.query("select payment_status from orders where id='two'")).rows[0].payment_status,'unpaid')
 assert.equal((await db.query('select balance from loyalty_cards')).rows[0].balance,2100,'wallet rollback')
 await db.exec('alter table employee_salary_payments add constraint test_failure check (amount < 40000)')
 await assert.rejects(settle(second),/test_failure/)
 assert.equal((await db.query("select payment_status from orders where id='two'")).rows[0].payment_status,'unpaid')
 assert.equal((await db.query('select count(*)::int n from order_salary_settlements')).rows[0].n,1)
 await db.exec('alter table employee_salary_payments drop constraint test_failure')
 await settle(second)
 assert.equal((await db.query('select count(*)::int n from employee_salary_payments')).rows[0].n,2)
 await db.exec("insert into restaurant_tables(id,status) values('t','occupied')")
 await seed('round1'); await seed('round2')
 await db.exec("update orders set table_id='t' where id in ('round1','round2'); insert into orders(id,table_id) values('shell','t')")
 const grouped={...second,request_id:id(12),order_id:null,table_id:'t',expected_order_ids:['round1','round2'],loyalty_used_amount:1000,payments:[{method:'salary',amount:79000}]}
 const groupedResult=await settle(grouped)
 assert.equal(groupedResult.cashback_earned,5530)
 assert.equal((await db.query("select status from restaurant_tables where id='t'")).rows[0].status,'available')
 assert.equal((await db.query("select status from orders where id='shell'")).rows[0].status,'cancelled')
 assert.equal((await db.query("select count(*)::int n from employee_salary_payments where amount=79000")).rows[0].n,1)
 await seed('new-round')
 await db.exec("update orders set table_id='t' where id='new-round'")
 assert.deepEqual(await settle(grouped),groupedResult)
 assert.equal((await db.query("select payment_status from orders where id='new-round'")).rows[0].payment_status,'unpaid')
 await db.exec('set role authenticated')
 await assert.rejects(db.query('select * from order_salary_settlements'),/permission denied/)
 assert.deepEqual(await settle(grouped),groupedResult,'delegated staff reconciles through RPC without payroll-table access')
 await db.exec('reset role')

})

test('salary deduction settles liability without cash or terminal movement and is visible in closeout', () => {
 const date='2026-09-24'
 const employee={id:id(2),employee_name:'Employee',joined_at:date,rates:[],payments:[{id:id(4),paid_date:date,amount:30000,payment_method:'salary',note:'Order GC-1'}]}
 const order={id:'one',payment_status:'paid',status:'paid',paid_at:`${date}T12:00:00+05:00`,total:30000,loyalty_used_amount:10000,payment_method:'salary',payments:[{method:'salary',amount:30000}]}
 const expenses=buildSalaryPaymentExpenseRows([employee],date,date)
 assert.equal(expenses.length,1)
 assert.equal(getSalaryBalance(employee,date),-30000)
 const cashflow=summarizeExpenseCashflow([order],expenses)
 assert.deepEqual(cashflow.byMethod.cash,{income:0,expenses:0,left:0})
 assert.deepEqual(cashflow.byMethod.terminal,{income:0,expenses:0,left:0})
 assert.deepEqual(cashflow.byMethod.salary,{income:30000,expenses:30000,left:0})
 const closeout=getDailyCloseout([order],date,date)
 assert.equal(closeout.revenue,30000)
 assert.equal(closeout.totals.salary,30000)
 assert.match(closeoutToCsv(closeout),/Salary deduction \(non-cash\).*30000/)
 const privateMessage=buildEmployeePaymentMessage({...employee.payments[0],employee_name:'Employee',created_by_name:'Manager'},-30000,'en')
 assert.match(privateMessage,/Order paid from salary/)
 assert.match(privateMessage,/No cash was paid out/)
 assert.match(privateMessage,/Order GC-1/)
 const status=buildCompletedOrderGroupMessage(order)
 assert.match(status,/Из зарплаты/)
 assert.doesNotMatch(status,/Remaining salary|Осталось к выплате/)
})
