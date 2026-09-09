// Isolated PostgreSQL trigger verification. Pass a PGlite module path.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
const db = new PGlite()
const scalar = async sql => (await db.query(sql)).rows[0].value
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema vault; create schema net; create schema cron;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create table profiles(id uuid, full_name text, email text);
    insert into profiles values('00000000-0000-0000-0000-000000000001','Manager','');
    set test.actor = '00000000-0000-0000-0000-000000000001';
    create table vault.decrypted_secrets(name text, decrypted_secret text, created_at timestamptz);
    insert into vault.decrypted_secrets values('zar_kebab_daily_report_cron_secret','test',now());
    create function net.http_get(url text, headers jsonb, timeout_milliseconds int) returns bigint language plpgsql as $$ begin raise exception 'offline test'; end $$;
    create table cron.job(jobid bigint, jobname text);
    create function cron.unschedule(bigint) returns boolean language sql as $$ select true $$;
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
    create table bazaar_product_catalog(product_key text primary key, product_name text, category text, unit text, normal_unit_price int, is_active boolean, is_catalog_managed boolean, updated_at timestamptz);
    insert into bazaar_product_catalog values('legacy','Legacy','groceries','kg',100,true,true,now());
  `)
  const sql = readFileSync(new URL('../supabase/189_ingredient_investor_notifications.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  assert.equal(await scalar('select count(*)::int as value from ingredient_investor_notifications'), 0)
  await db.exec("insert into bazaar_product_catalog values('flour','Flour','groceries','kg',10000,true,true,now())")
  assert.equal(await scalar('select count(*)::int as value from ingredient_investor_notifications'), 1)
  await db.exec("update bazaar_product_catalog set updated_at=now(), normal_unit_price=10000 where product_key='flour'")
  assert.equal(await scalar('select count(*)::int as value from ingredient_investor_notifications'), 1)
  await db.exec("update bazaar_product_catalog set product_name='Premium flour', normal_unit_price=12000 where product_key='flour'")
  const snap = await scalar("select snapshot as value from ingredient_investor_notifications where event_type='updated'")
  assert.equal(snap.before.normal_unit_price, 10000)
  assert.equal(snap.after.normal_unit_price, 12000)
  assert.equal(snap.actor_name, 'Manager')
  await db.exec("update bazaar_product_catalog set is_active=false where product_key='flour'; update bazaar_product_catalog set is_active=false where product_key='flour'; update bazaar_product_catalog set is_active=true where product_key='flour'")
  assert.deepEqual((await db.query('select event_type from ingredient_investor_notifications order by created_at')).rows.map(r=>r.event_type), ['created','updated','archived','restored'])
  await db.exec("insert into bazaar_product_catalog values('imported','Imported','groceries','kg',100,true,false,now())")
  assert.equal(await scalar('select count(*)::int as value from ingredient_investor_notifications'), 4)
  await db.exec("update bazaar_product_catalog set is_catalog_managed=true where product_key='imported'")
  assert.equal(await scalar("select event_type as value from ingredient_investor_notifications where product_key='imported'"), 'created')
  await db.exec("set test.actor=''; update bazaar_product_catalog set normal_unit_price=999 where product_key='flour'")
  assert.equal(await scalar('select count(*)::int as value from ingredient_investor_notifications'), 5)
  assert.equal(await scalar("select snapshot->'after'->>'normal_unit_price' as value from ingredient_investor_notifications where event_type='updated'"), '12000')
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from ingredient_investor_notifications'), /permission denied/)
  console.log('Ingredient notification SQL passed: real changes only, archive/restore, immutable snapshots, service privacy, no backfill, and dispatch failure isolation.')
} finally { await db.close() }
