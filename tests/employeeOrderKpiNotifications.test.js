import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildEmployeeOrderKpiMessage, deliverEmployeeOrderKpiNotification } from '../api/telegram/_lib/employeeOrderKpiNotifications.js'

test('compact private message escapes order numbers and distinguishes an estimate', () => {
  const text = buildEmployeeOrderKpiMessage({order_number:'<12>',total:345000,rate_bps:300,cut:10350})
  assert.equal(text, '✅ Заказ №&lt;12&gt; оплачен\nСумма: 345 000 сум\nВаш KPI (3%): ≈ 10 350 сум\nИтог KPI — после закрытия дня.')
})

test('production payment trigger snapshots only new paid orders and eligible linked openers', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema vault; create schema extensions; create schema net; create schema cron;
    create table vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz);
    create table cron.job(jobid bigint,jobname text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
    create table employee_salary_profiles(id uuid,profile_id uuid,joined_at date,ended_at date,deleted_at timestamptz);
    create table employee_kpi_rules(id uuid,salary_profile_id uuid,effective_from date,created_at timestamptz,order_opener_profile_id uuid,rate_bps integer,is_enabled boolean);
    create table employee_salary_telegram_links(salary_profile_id uuid,chat_id text,notifications_enabled boolean);
    create table employee_salary_absences(salary_profile_id uuid,absence_date date);
    create table orders(id text,order_number integer,opened_by uuid,paid_at timestamptz,payment_status text,status text,order_type text,subtotal integer,service_fee integer,total integer);
    insert into employee_salary_profiles values('00000000-0000-0000-0000-000000000001',null,'2026-01-01',null,null);
    insert into employee_kpi_rules values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','2026-09-16',now(),'00000000-0000-0000-0000-000000000003',300,true);
    insert into employee_salary_telegram_links values('00000000-0000-0000-0000-000000000001','private-chat',true);
    insert into orders values('historical',1,'00000000-0000-0000-0000-000000000003','2026-09-16T12:00:00Z','paid','completed','dine_in',300000,45000,340000);
  `)
  await db.exec(readFileSync(new URL('../supabase/197_employee_order_kpi_notifications.sql',import.meta.url),'utf8'))
  assert.equal((await db.query('select * from employee_order_kpi_notifications')).rows.length,0)
  await db.exec(`insert into orders select 'new',2,opened_by,paid_at,'unpaid',status,order_type,subtotal,service_fee,total from orders where id='historical'; update orders set payment_status='paid' where id='new';`)
  let rows=(await db.query('select * from employee_order_kpi_notifications')).rows
  assert.equal(rows.length,1); assert.equal(rows[0].snapshot.cut,10350); assert.equal(rows[0].snapshot.total,340000)
  assert.equal(rows[0].chat_id,'private-chat')
  await db.exec(`update orders set payment_status='paid'; update orders set payment_status='unpaid' where id='new'; update orders set payment_status='paid' where id='new';`)
  assert.equal((await db.query('select * from employee_order_kpi_notifications')).rows.length,1)
  await db.exec(`insert into employee_salary_absences values('00000000-0000-0000-0000-000000000001','2026-09-16'); insert into orders select 'absent',3,opened_by,paid_at,'unpaid',status,order_type,subtotal,service_fee,total from orders where id='historical'; update orders set payment_status='paid' where id='absent';`)
  assert.equal((await db.query("select snapshot from employee_order_kpi_notifications where order_id='absent'")).rows[0].snapshot.cut,0)
  await db.exec(`update employee_salary_telegram_links set notifications_enabled=false; insert into orders select 'optout',4,opened_by,paid_at,'unpaid',status,order_type,subtotal,service_fee,total from orders where id='historical'; update orders set payment_status='paid' where id='optout';`)
  assert.equal((await db.query('select * from employee_order_kpi_notifications')).rows.length,2)
})

function ledger() {
  let row={id:'one',status:'queued',chat_id:'private',snapshot:{order_number:1,total:100,rate_bps:300,cut:3}}
  return {get row(){return row},from(){let patch,filters=[]; const q={update(p){patch=p;return q},eq(k,v){filters.push([k,v]);return q},select(){return q},async maybeSingle(){if(!filters.every(([k,v])=>row[k]===v))return {data:null};row={...row,...patch};return {data:{...row}}},then(resolve,reject){return q.maybeSingle().then(resolve,reject)}};return q}}
}
test('concurrent send claims once; uncertain sends stay held',async()=>{
  const db=ledger();let sends=0; const row={...db.row}
  const send=async()=>{sends++;return {result:{message_id:123}}}
  await Promise.all([deliverEmployeeOrderKpiNotification(db,row,send),deliverEmployeeOrderKpiNotification(db,row,send)])
  assert.equal(sends,1);assert.equal(db.row.status,'sent')
  const failed=ledger(); await deliverEmployeeOrderKpiNotification(failed,{...failed.row},async()=>{throw new Error('timeout')})
  assert.equal(failed.row.status,'processing')
  assert.equal((await deliverEmployeeOrderKpiNotification(failed,{...failed.row},send)).status,'duplicate')
  assert.equal(sends,1)
})
