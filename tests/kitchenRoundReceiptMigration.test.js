import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/128_durable_kitchen_round_receipts.sql', import.meta.url),
  'utf8'
)

function functionBody(source, functionName) {
  const start = source.indexOf(`create or replace function public.${functionName}`)
  assert.notEqual(start, -1, `${functionName} must exist`)
  const end = source.indexOf('\n$$;', start)
  assert.notEqual(end, -1, `${functionName} must have a complete body`)
  return source.slice(start, end + 4)
}

test('migration creates a durable immutable kitchen-round receipt without cascading foreign keys', () => {
  const tableStart = migration.indexOf('create table if not exists public.order_kitchen_rounds')
  const tableEnd = migration.indexOf('\n);', tableStart)
  const tableDefinition = migration.slice(tableStart, tableEnd)

  assert.match(tableDefinition, /order_id text not null/)
  assert.match(tableDefinition, /kitchen_round_id text not null/)
  assert.match(tableDefinition, /item_ids uuid\[\] not null/)
  assert.match(tableDefinition, /primary key \(order_id, kitchen_round_id\)/)
  assert.doesNotMatch(tableDefinition, /references public\.(?:orders|order_items)/)
  assert.match(migration, /array_agg\(distinct item\.id order by item\.id\)/)
  assert.match(
    migration,
    /unnest\(public\.order_kitchen_rounds\.item_ids \|\| excluded\.item_ids\)/
  )
})

test('receipt access is read-only for authenticated Tables-authorized staff and health checks', () => {
  assert.match(migration, /alter table public\.order_kitchen_rounds enable row level security/)
  assert.match(migration, /create policy order_kitchen_rounds_tables_read[\s\S]*for select[\s\S]*to authenticated[\s\S]*current_staff_can_access\('tables'\)/)
  assert.match(migration, /revoke all on table public\.order_kitchen_rounds from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.order_kitchen_rounds to authenticated, service_role/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table public\.order_kitchen_rounds to authenticated/i)
  assert.doesNotMatch(migration, /create policy [^\n]+[\s\S]{0,160}for (?:insert|update|delete|all)/i)
})

test('submit RPC records the receipt atomically and checks it before mutable order state', () => {
  const submit = functionBody(migration, 'submit_order_to_kitchen(payload jsonb)')
  const lockAt = submit.indexOf('pg_advisory_xact_lock')
  const receiptCheckAt = submit.indexOf('from public.order_kitchen_rounds as receipt')
  const orderWriteAt = submit.indexOf('insert into public.orders')
  const itemWriteAt = submit.indexOf('insert into public.order_items')
  const tableWriteAt = submit.indexOf('update public.restaurant_tables')
  const receiptWriteAt = submit.lastIndexOf('insert into public.order_kitchen_rounds')

  assert.ok(lockAt >= 0 && lockAt < receiptCheckAt)
  assert.ok(receiptCheckAt < orderWriteAt)
  assert.ok(orderWriteAt < itemWriteAt)
  assert.ok(itemWriteAt < tableWriteAt)
  assert.ok(tableWriteAt < receiptWriteAt)
  assert.match(submit.slice(receiptCheckAt, orderWriteAt), /then\s+return;/)
  assert.doesNotMatch(submit.slice(receiptCheckAt, orderWriteAt), /payment_status/)
  assert.match(submit, /quantity numeric,/)
  assert.match(submit, /current_staff_can_write\('tables'\) is not true/)
  assert.match(submit, /set lock_timeout = '8s'/)
  assert.ok(submit.indexOf("raise exception 'order id is required'") < submit.indexOf("current_staff_can_write('tables')"))
  assert.match(submit, /security definer/)
})

test('new rounds cannot reopen terminal orders that have no receipt', () => {
  const submit = functionBody(migration, 'submit_order_to_kitchen(payload jsonb)')

  assert.match(
    submit,
    /coalesce\(public\.orders\.payment_status, 'unpaid'\) not in \('paid', 'cancelled'\)/
  )
  assert.match(
    submit,
    /coalesce\(public\.orders\.status, 'sent_to_kitchen'\) not in \('paid', 'completed', 'cancelled'\)/
  )
  assert.match(
    submit,
    /coalesce\(status, 'sent_to_kitchen'\) not in \('paid', 'completed', 'cancelled'\)/
  )
})

test('a committed insert trigger closes the legacy-RPC deployment race before replacement', () => {
  const replayGuard = functionBody(migration, 'reject_replayed_kitchen_round_item()')
  const triggerFunction = functionBody(migration, 'record_order_kitchen_round_receipt()')
  const replayTriggerAt = migration.indexOf('create trigger order_items_reject_replayed_kitchen_round_item')
  const triggerAt = migration.indexOf('create trigger order_items_record_kitchen_round_receipt')
  const deleteTriggerAt = migration.indexOf('create trigger order_items_preserve_kitchen_round_receipt')
  const backfillAt = migration.indexOf('array_agg(distinct item.id order by item.id)')
  const phaseOneCommitAt = migration.indexOf('\ncommit;')
  const phaseTwoBeginAt = migration.indexOf('\nbegin;', phaseOneCommitAt + 1)
  const replacementAt = migration.indexOf(
    'create or replace function public.submit_order_to_kitchen(payload jsonb)'
  )

  assert.match(migration, /set local lock_timeout = '5s'/)
  assert.match(replayGuard, /new\.id = any\(receipt\.item_ids\)/)
  assert.match(replayGuard, /raise exception 'Kitchen round % was already submitted'/)
  assert.match(triggerFunction, /security definer/)
  assert.match(migration, /after insert on public\.order_items/)
  assert.match(migration, /before delete on public\.order_items/)
  assert.match(
    triggerFunction,
    /unnest\(public\.order_kitchen_rounds\.item_ids \|\| excluded\.item_ids\)/
  )
  assert.ok(replayTriggerAt >= 0 && replayTriggerAt < triggerAt)
  assert.ok(triggerAt < deleteTriggerAt)
  assert.ok(deleteTriggerAt < phaseOneCommitAt)
  assert.ok(phaseOneCommitAt < phaseTwoBeginAt)
  assert.ok(phaseTwoBeginAt < replacementAt)
  assert.ok(replacementAt < backfillAt)
})

test('the receipt-aware RPC repairs live legacy rounds before the non-blocking backfill', () => {
  const submit = functionBody(migration, 'submit_order_to_kitchen(payload jsonb)')
  const durableCheckAt = submit.indexOf('from public.order_kitchen_rounds as receipt')
  const legacyCheckAt = submit.indexOf('from public.order_items as existing_item')
  const mutableOrderWriteAt = submit.indexOf('insert into public.orders')
  const phaseTwoCommitAt = migration.indexOf(
    '\ncommit;',
    migration.indexOf('create or replace function public.submit_order_to_kitchen(payload jsonb)')
  )
  const historicalBackfillAt = migration.indexOf('array_agg(distinct item.id order by item.id)')

  assert.ok(durableCheckAt >= 0 && durableCheckAt < legacyCheckAt)
  assert.ok(legacyCheckAt < mutableOrderWriteAt)
  assert.match(submit.slice(legacyCheckAt, mutableOrderWriteAt), /insert into public\.order_kitchen_rounds/)
  assert.match(submit.slice(legacyCheckAt, mutableOrderWriteAt), /then[\s\S]*return;/)
  assert.ok(phaseTwoCommitAt < historicalBackfillAt)
})

test('authenticated callers and service-role health checks may execute the permission-checked submit RPC', () => {
  assert.match(migration, /revoke all on function public\.submit_order_to_kitchen\(jsonb\)[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.submit_order_to_kitchen\(jsonb\)[\s\S]*to authenticated, service_role/)
  assert.match(migration, /create or replace function public\.kitchen_round_receipts_version\(\)/)
  assert.match(migration, /grant execute on function public\.kitchen_round_receipts_version\(\)[\s\S]*to authenticated, service_role/)
})
