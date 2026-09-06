// Optional isolated PostgreSQL verification; pass a PGlite module path as argv[2].
// Installs nothing and never connects to the production database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema vault; create schema net; create schema cron;
    create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz);
    create function net.http_get(url text, headers jsonb, timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
    create table cron.job(jobid bigint, jobname text);
    create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
    create function cron.schedule(text, text, text) returns bigint language sql as $$ select 1::bigint $$;
    create table public.profiles(id uuid, full_name text);
    create table public.orders(id text primary key, order_type text, price_mode text);
    create table public.menu_items(id uuid primary key, name_ru text);
    create table public.order_items(id uuid primary key, order_id text, menu_item_id uuid, name text, quantity numeric, sale_unit text, price numeric, unit_price numeric, selected_options jsonb, notes text, status text, created_at timestamptz default now());
    create table public.order_kitchen_rounds(order_id text, kitchen_round_id text, item_ids uuid[], submitted_at timestamptz default now(), primary key(order_id, kitchen_round_id));
    insert into profiles values(auth.uid(), 'Actual Submitter');
    insert into orders values('gc', 'game_club', 'regular'), ('ta', 'take_away', 'regular');
    insert into order_kitchen_rounds values('gc', 'historical', array[]::uuid[], now());
  `)
  const migration = readFileSync(new URL('../supabase/180_game_club_team_notifications.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // Safe to reapply, no historical backfill.
  assert.equal((await db.query('select count(*)::int as count from game_club_team_notifications')).rows[0].count, 0)
  await db.exec(`begin;
    insert into order_items(id, order_id, name, quantity, price) values('00000000-0000-0000-0000-000000000011','gc','Kebab',2,24000);
    insert into order_kitchen_rounds values('gc','r1',array['00000000-0000-0000-0000-000000000011'::uuid],now());
    insert into order_items(id, order_id, name, quantity, price) values('00000000-0000-0000-0000-000000000012','gc','Cola',1,12000);
    update order_kitchen_rounds set item_ids = item_ids || '00000000-0000-0000-0000-000000000012'::uuid where kitchen_round_id='r1';
  `)
  assert.equal((await db.query('select count(*)::int as count from game_club_team_notifications')).rows[0].count, 0)
  await db.exec('commit')
  const first = (await db.query('select snapshot from game_club_team_notifications')).rows[0].snapshot
  assert.equal(first.total, 60000)
  assert.equal(first.items.length, 2)
  assert.equal(first.actor_name, 'Actual Submitter')
  await db.exec(`begin;
    update orders set price_mode='tourist' where id='gc';
    insert into order_items(id,order_id,name,quantity,price) values('00000000-0000-0000-0000-000000000013','gc','Extra',1,18000);
    insert into order_kitchen_rounds values('gc','r2',array['00000000-0000-0000-0000-000000000013'::uuid],now());
    insert into order_kitchen_rounds values('gc','r2',array['00000000-0000-0000-0000-000000000013'::uuid],now()) on conflict do nothing;
    insert into order_kitchen_rounds values('ta','r3',array['00000000-0000-0000-0000-000000000013'::uuid],now());
    commit;
    update order_items set price=999999;
  `)
  const rows = (await db.query('select snapshot from game_club_team_notifications order by kitchen_round_id')).rows
  assert.equal(rows.length, 2)
  assert.equal(rows[0].snapshot.total, 60000)
  assert.equal(rows[1].snapshot.total, 18000)
  assert.equal(rows[1].snapshot.price_mode, 'tourist')
  assert.equal(rows[1].snapshot.items.length, 1)
  console.log('PostgreSQL migration passed: deferred full-round snapshots, actor, additional rounds, duplicate suppression, archival values, no historical/non-Game-Club sends, reapplication.')
} finally { await db.close() }
