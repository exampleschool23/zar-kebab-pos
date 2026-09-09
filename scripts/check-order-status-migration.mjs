// Usage: node scripts/check-order-status-migration.mjs /path/to/pglite/dist/index.js
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role; create table public.orders(id text primary key); create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';`)
await db.exec(readFileSync('supabase/185_order_status_message_cleanup.sql', 'utf8'))
await db.exec(`insert into orders values ('a'),('b'); insert into order_status_telegram_messages(id,order_ids,chat_id) values ('00000000-0000-0000-0000-000000000001',array['a','b'],'-100'); delete from orders where id='b';`)
assert.equal((await db.query('select delete_requested from order_status_telegram_messages')).rows[0].delete_requested,true)
await db.exec(`insert into order_status_telegram_messages(id,order_ids,chat_id) values ('00000000-0000-0000-0000-000000000002',array['missing'],'-100');`)
assert.equal((await db.query('select count(*)::int as n from order_status_telegram_messages where delete_requested')).rows[0].n,2)
console.log('SQL migration and deletion/reservation triggers passed')
await db.close()
