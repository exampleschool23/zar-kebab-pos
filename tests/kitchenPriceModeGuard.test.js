import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('kitchen submission rejects rounds that conflict with an open bill price mode on the table', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create function current_staff_can_write(text) returns boolean language sql as $$ select true $$;
    create table orders(id text primary key, table_id text, payment_status text default 'unpaid',
      status text default 'sent_to_kitchen', paid_at timestamptz, price_mode text);
    create table order_items(id text primary key, order_id text, status text default 'new',
      kitchen_round_id text, price_mode text);
    create table order_kitchen_rounds(order_id text, kitchen_round_id text, primary key (order_id, kitchen_round_id));
    -- Minimal stand-in for the receipt-aware worker from 128/138.
    create function submit_order_to_kitchen_unchecked(payload jsonb) returns void language plpgsql as $$
    begin
      if exists (select 1 from order_kitchen_rounds where order_id = payload #>> '{order,id}'
        and kitchen_round_id = payload ->> 'kitchen_round_id') then return; end if;
      insert into orders(id, table_id, price_mode)
        values (payload #>> '{order,id}', payload #>> '{order,table_id}', payload #>> '{order,price_mode}')
        on conflict (id) do update set price_mode = excluded.price_mode;
      insert into order_items(id, order_id, kitchen_round_id, price_mode)
        select i ->> 'id', payload #>> '{order,id}', payload ->> 'kitchen_round_id', i ->> 'price_mode'
        from jsonb_array_elements(payload -> 'items') i;
      insert into order_kitchen_rounds values (payload #>> '{order,id}', payload ->> 'kitchen_round_id');
    end $$;
  `)
  await db.exec(read('migrations/221_kitchen_price_mode_guard.sql'))

  let n = 0
  const submit = (orderId, mode, { round = `r${++n}`, itemMode = mode, table = 't3', orderType = 'dine_in' } = {}) =>
    db.query('select submit_order_to_kitchen($1::jsonb)', [JSON.stringify({
      order: { id: orderId, table_id: table, price_mode: mode, order_type: orderType },
      items: [{ id: `${round}-item`, price_mode: itemMode, order_type: orderType }],
      kitchen_round_id: round,
    })])
  const conflict = /Table price mode conflict/

  // The incident: a Regular bill was emptied, the table was re-sent as Tourist,
  // then a stale device sent Regular into the emptied shell.
  await submit('regular-shell', 'regular', { round: 'first' })
  await db.query("update order_items set status = 'cancelled' where order_id = 'regular-shell'")
  await submit('tourist', 'tourist')
  await assert.rejects(submit('regular-shell', 'regular'), conflict)
  await assert.rejects(submit('new-regular', 'regular'), conflict)
  // A locked bill cannot be flipped, and stale cart rows cannot carry the other mode.
  await assert.rejects(submit('tourist', 'regular'), conflict)
  await assert.rejects(submit('tourist', 'tourist', { itemMode: 'regular' }), conflict)

  // Matching rounds, committed-round retries and other tables are unaffected.
  await submit('tourist', 'tourist')
  await submit('regular-shell', 'regular', { round: 'first' })
  await submit('other-table', 'regular', { table: 't4' })
  await submit('ta-1', 'regular', { table: null, orderType: 'take_away' })

  // Paid bills no longer lock the table.
  await db.query("update orders set payment_status = 'paid', status = 'paid', paid_at = now() where id = 'tourist'")
  await submit('regular-after-paid', 'regular')

  const items = (await db.query("select order_id, price_mode from order_items where status <> 'cancelled' and order_id in ('tourist','regular-shell') order by id")).rows
  assert.deepEqual(new Set(items.map(row => `${row.order_id}:${row.price_mode}`)), new Set(['tourist:tourist']))
})
