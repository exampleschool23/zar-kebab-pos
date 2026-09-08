// Isolated PostgreSQL regression and benchmark; no production access.
// Usage: node scripts/check-tech-card-cost-sync.mjs /path/to/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite')
const read = name => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8')
const variant = read('156_variant_tech_cards.sql')
const prior = read('155_tech_card_real_costs.sql')
const migration = read('183_batch_tech_card_cost_sync.sql')
const functionSql = (source, name) => {
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0, name)
  return source.slice(start, source.indexOf('$$;', start) + 3)
}
const db = new PGlite()
const scalar = async sql => (await db.query(sql)).rows[0].value
const payload = (id, price = 10, variant_option_id = '') => ({
  menu_item_id: id, variant_option_id, portion_count: 1, preparation_steps: 'Mix',
  ingredients: Array.from({ length: 10 }, (_, i) => ({ name: `Ingredient ${i}`, quantity: 1, unit: 'kg', unit_price_uzs: price })),
  components: [],
})
const save = async card => db.query('select save_menu_item_tech_card($1::jsonb)', [JSON.stringify(card)])
const instrument = async () => {
  const definition = await scalar("select pg_get_functiondef('sync_menu_item_tech_card_real_costs()'::regprocedure) as value")
  await db.exec(definition.replace('begin\n', "begin\n  insert into sync_calls default values;\n"))
}
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function current_staff_can_access(text) returns boolean language sql as $$ select true $$;
    create function current_staff_can_write(text) returns boolean language sql as $$ select true $$;
    create table menu_items(id text primary key, deleted_at timestamptz, option_groups jsonb default '[]');
    create table menu_item_costs(menu_item_id text primary key references menu_items, cost_price integer, variant_costs jsonb default '{}', cost_source text default 'manual', updated_at timestamptz default now());
    create table menu_item_tech_cards(menu_item_id text, variant_option_id text default '', portion_count numeric, batch_output_quantity numeric, batch_output_unit text, preparation_steps text, notes text, updated_by uuid, updated_at timestamptz, primary key(menu_item_id,variant_option_id));
    create table menu_item_tech_card_ingredients(menu_item_id text, variant_option_id text default '', name text, quantity numeric, unit text, unit_price_uzs bigint, sort_order integer, updated_at timestamptz);
    create table menu_item_tech_card_components(menu_item_id text, variant_option_id text default '', component_menu_item_id text, selected_options jsonb default '{}', quantity numeric, sort_order integer, updated_at timestamptz);
    create table sync_calls(id integer generated always as identity);
    create table cost_writes(id integer generated always as identity);
    create function count_cost_write() returns trigger language plpgsql as $$ begin insert into cost_writes default values; return new; end $$;
    create trigger count_cost_write after insert or update on menu_item_costs for each row execute function count_cost_write();
    insert into menu_items(id) select 'item-' || n from generate_series(1,30) n;
    insert into menu_items(id, option_groups) values('manual','[{"id":"size","options":[{"id":"large"}]}]');
    insert into menu_item_costs(menu_item_id,cost_price,variant_costs) values('manual',20,'{"large":50}');
  `)
  for (const name of ['calculate_menu_item_variant_tech_card_real_cost', 'enforce_menu_item_cost_source', 'sync_menu_item_tech_card_real_costs', 'save_menu_item_tech_card']) {
    await db.exec(functionSql(variant, name))
  }
  await db.exec(`create trigger menu_item_costs_enforce_source before insert or update of cost_price, cost_source on menu_item_costs for each row execute function enforce_menu_item_cost_source();`)
  // Seed without sync triggers to keep setup outside the benchmark.
  for (let i = 1; i <= 30; i++) await save(payload(`item-${i}`))
  await db.exec('select sync_menu_item_tech_card_real_costs()')
  await db.exec(functionSql(prior, 'trigger_sync_menu_item_tech_card_real_costs'))
  await db.exec(prior.slice(prior.indexOf('drop trigger if exists menu_item_costs_refresh'), prior.indexOf('select public.sync_menu_item_tech_card_real_costs();', prior.indexOf('drop trigger if exists menu_item_costs_refresh'))))
  await instrument()
  const measure = async () => {
    await db.exec('truncate sync_calls, cost_writes')
    const start = performance.now()
    await save(payload('item-1', 11))
    return { milliseconds: Math.round(performance.now() - start), syncs: await scalar('select count(*)::int as value from sync_calls'), writes: await scalar('select count(*)::int as value from cost_writes') }
  }
  const before = await measure()
  assert.equal(before.syncs, 21)
  await db.exec(migration)
  await db.exec(migration) // Reapplication must be safe.
  await instrument()
  await save(payload('item-1', 10))
  const after = await measure()
  assert.equal(after.syncs, 1)
  assert.equal(after.writes, 1)
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-1'"), 110)
  await measure() // Unchanged recipe must not rewrite any protected costs.
  assert.equal(await scalar('select count(*)::int as value from cost_writes'), 0)

  // Nested, fractional dependencies must propagate through every level.
  const componentCard = (id, child, quantity, selected_options = {}) => ({ ...payload(id), ingredients: [], components: [{ component_menu_item_id: child, quantity, selected_options }] })
  await save(componentCard('item-2', 'manual', 0.5, { size: 'large' }))
  await save(componentCard('item-3', 'item-2', 2))
  await db.exec("update menu_item_costs set variant_costs='{" + '"large":80' + "}' where menu_item_id='manual'")
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-2'"), 40)
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-3'"), 80)
  await save(componentCard('item-4', 'manual', 2))
  await db.exec("update menu_item_costs set cost_price=30 where menu_item_id='manual'")
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-4'"), 60)

  // A saved variant updates its protected option cost and all dependent recipes.
  await db.exec(`update menu_items set option_groups='[{"id":"size","options":[{"id":"large"}]}]' where id='item-5'`)
  await save(payload('item-5', 20, 'large'))
  await save(componentCard('item-6', 'item-5', 0.5, { size: 'large' }))
  await save(payload('item-5', 30, 'large'))
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-6'"), 150)

  // Force a deferred flush, mutate again in the same transaction, then commit.
  await db.exec('begin; set constraints all immediate')
  await db.exec("update menu_item_tech_card_ingredients set unit_price_uzs=12 where menu_item_id='item-1'")
  await db.exec("update menu_item_tech_card_ingredients set unit_price_uzs=13 where menu_item_id='item-1'")
  await db.exec('commit')
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-1'"), 130)

  await db.exec('begin')
  await save(payload('item-1', 99))
  await db.exec('rollback')
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-1'"), 130)
  // Missing component cost fails atomically at commit.
  await db.exec("insert into menu_items(id) values('missing-cost')")
  await assert.rejects(save(componentCard('item-7', 'missing-cost', 1)), /Every included menu item must have a real cost/)
  assert.equal(await scalar("select count(*)::int as value from menu_item_tech_card_components where menu_item_id='item-7'"), 0)
  await save(payload('item-1', 14)) // Failure cannot leak the transaction flags.
  assert.equal(await scalar("select cost_price as value from menu_item_costs where menu_item_id='item-1'"), 140)
  console.log(JSON.stringify({ before, after, verified: ['single sync', 'unchanged cost suppression', 'nested and fractional components', 'manual base and variant changes', 'saved variant propagation', 'immediate constraints', 'rollback', 'missing cost rejection', 'reapplication'] }, null, 2))
} finally {
  await db.close()
}
