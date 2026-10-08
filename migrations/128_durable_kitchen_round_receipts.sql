-- Durable kitchen-round receipts make an acknowledged waiter retry a no-op even
-- after its order or item rows have been paid, cancelled, or physically removed.
-- The receipt is committed in the same transaction as the order, items, and table.

begin;

-- Do not let a busy legacy submit leave deployment waiting indefinitely. A
-- timeout rolls the whole migration back so it can be retried safely.
set local lock_timeout = '5s';

create table if not exists public.order_kitchen_rounds (
  order_id text not null,
  kitchen_round_id text not null,
  item_ids uuid[] not null,
  table_id text,
  submitted_by uuid,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint order_kitchen_rounds_pkey primary key (order_id, kitchen_round_id),
  constraint order_kitchen_rounds_item_ids_nonempty check (cardinality(item_ids) > 0)
);

comment on table public.order_kitchen_rounds is
  'Immutable idempotency receipts for waiter kitchen rounds. Deliberately has no order/item foreign keys.';

alter table public.order_kitchen_rounds enable row level security;

drop policy if exists order_kitchen_rounds_tables_read on public.order_kitchen_rounds;
create policy order_kitchen_rounds_tables_read
  on public.order_kitchen_rounds
  for select
  to authenticated
  using (public.current_staff_can_access('tables'));

-- Authenticated clients may inspect receipts for operational recovery, but only
-- the permission-checked submit RPC may create them. They are never mutable.
revoke all on table public.order_kitchen_rounds from public, anon, authenticated;
grant select on table public.order_kitchen_rounds to authenticated, service_role;

-- During the phase-two function swap, a transaction may still be running the
-- legacy migration-096 body. If that old body retries an already-recorded item
-- after the mutable order rows were deleted, fail the whole legacy transaction
-- before it can resurrect the order shell or dish.
create or replace function public.reject_replayed_kitchen_round_item()
returns trigger
language plpgsql
security definer
set search_path = public
set lock_timeout = '8s'
as $$
begin
  if nullif(btrim(new.kitchen_round_id), '') is not null
     and exists (
       select 1
       from public.order_kitchen_rounds as receipt
       where receipt.order_id = new.order_id
         and receipt.kitchen_round_id = new.kitchen_round_id
         and new.id = any(receipt.item_ids)
     ) then
    raise exception 'Kitchen round % was already submitted', new.kitchen_round_id
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_replayed_kitchen_round_item()
  from public, anon, authenticated;

drop trigger if exists order_items_reject_replayed_kitchen_round_item on public.order_items;
create trigger order_items_reject_replayed_kitchen_round_item
before insert on public.order_items
for each row execute function public.reject_replayed_kitchen_round_item();

-- Install this trigger in its own committed phase before replacing the RPC.
-- The trigger's table lock drains older inserts; calls that resume afterward
-- see the committed trigger even if they are still executing migration 096's
-- legacy function body.
create or replace function public.record_order_kitchen_round_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
set lock_timeout = '8s'
as $$
declare
  source_order_id text;
  source_kitchen_round_id text;
  source_item_id uuid;
  source_item_submitted_at timestamptz;
  source_table_id text;
  source_submitted_by uuid;
begin
  if tg_op = 'DELETE' then
    source_order_id := old.order_id;
    source_kitchen_round_id := old.kitchen_round_id;
    source_item_id := old.id;
    source_item_submitted_at := coalesce(old.submitted_at, old.created_at, now());
  else
    source_order_id := new.order_id;
    source_kitchen_round_id := new.kitchen_round_id;
    source_item_id := new.id;
    source_item_submitted_at := coalesce(new.submitted_at, new.created_at, now());
  end if;

  if nullif(btrim(source_kitchen_round_id), '') is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select source_order.table_id, source_order.opened_by
  into source_table_id, source_submitted_by
  from public.orders as source_order
  where source_order.id = source_order_id;

  insert into public.order_kitchen_rounds (
    order_id,
    kitchen_round_id,
    item_ids,
    table_id,
    submitted_by,
    submitted_at
  ) values (
    source_order_id,
    source_kitchen_round_id,
    array[source_item_id],
    source_table_id,
    source_submitted_by,
    source_item_submitted_at
  )
  on conflict (order_id, kitchen_round_id) do update
  set
    item_ids = (
      select array_agg(distinct receipt_item_id order by receipt_item_id)
      from unnest(public.order_kitchen_rounds.item_ids || excluded.item_ids) as receipt_item_id
    ),
    table_id = coalesce(public.order_kitchen_rounds.table_id, excluded.table_id),
    submitted_by = coalesce(public.order_kitchen_rounds.submitted_by, excluded.submitted_by),
    submitted_at = least(public.order_kitchen_rounds.submitted_at, excluded.submitted_at);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.record_order_kitchen_round_receipt()
  from public, anon, authenticated;

drop trigger if exists order_items_record_kitchen_round_receipt on public.order_items;
create trigger order_items_record_kitchen_round_receipt
after insert on public.order_items
for each row execute function public.record_order_kitchen_round_receipt();

drop trigger if exists order_items_preserve_kitchen_round_receipt on public.order_items;
create trigger order_items_preserve_kitchen_round_receipt
before delete on public.order_items
for each row execute function public.record_order_kitchen_round_receipt();

commit;

-- Phase two can now replace the RPC without a deployment gap: any transaction
-- still running the old body is protected by the committed insert trigger.
begin;
set local lock_timeout = '5s';

create or replace function public.submit_order_to_kitchen(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
set lock_timeout = '8s'
as $$
declare
  order_payload jsonb := payload -> 'order';
  target_order_id text := order_payload ->> 'id';
  target_table_id text := nullif(order_payload ->> 'table_id', '');
  target_order_type text := coalesce(nullif(order_payload ->> 'order_type', ''), 'dine_in');
  target_price_mode text := coalesce(nullif(order_payload ->> 'price_mode', ''), 'regular');
  target_waiter_name text := coalesce(order_payload ->> 'waiter_name', 'Waiter');
  target_kitchen_round_id text := coalesce(
    nullif(payload ->> 'kitchen_round_id', ''),
    nullif(payload #>> '{items,0,kitchen_round_id}', '')
  );
  target_item_ids uuid[];
  target_submitted_at timestamptz;
begin
  if target_order_id is null or target_order_id = '' then
    raise exception 'order id is required' using errcode = '22023';
  end if;

  if public.current_staff_can_write('tables') is not true then
    raise exception 'Tables write access is required to submit an order'
      using errcode = '42501';
  end if;

  if target_kitchen_round_id is null then
    raise exception 'kitchen round id is required' using errcode = '22023';
  end if;

  if target_price_mode not in ('regular', 'tourist') then
    target_price_mode := 'regular';
  end if;

  -- Keep the exact lock namespace shared with settlement and migration 096.
  perform pg_advisory_xact_lock(hashtextextended(
    case
      when target_table_id is not null then 'pos-table:' || target_table_id
      else 'pos-order:' || target_order_id
    end,
    0
  ));

  -- A durable receipt is conclusive even if the mutable order and its items no
  -- longer exist or have since become paid/cancelled.
  if exists (
    select 1
    from public.order_kitchen_rounds as receipt
    where receipt.order_id = target_order_id
      and receipt.kitchen_round_id = target_kitchen_round_id
  ) then
    return;
  end if;

  -- Deployment-order fallback: a pre-migration live round may not have been
  -- reached by the non-blocking historical backfill yet. Promote its existing
  -- rows into a durable receipt under the same advisory lock and treat the
  -- exact round as already submitted.
  if exists (
    select 1
    from public.order_items as existing_item
    where existing_item.order_id = target_order_id
      and existing_item.kitchen_round_id = target_kitchen_round_id
  ) then
    insert into public.order_kitchen_rounds (
      order_id,
      kitchen_round_id,
      item_ids,
      table_id,
      submitted_by,
      submitted_at,
      created_at
    )
    select
      existing_item.order_id,
      existing_item.kitchen_round_id,
      array_agg(distinct existing_item.id order by existing_item.id),
      existing_order.table_id,
      existing_order.opened_by,
      min(coalesce(existing_item.submitted_at, existing_item.created_at)),
      min(coalesce(existing_item.submitted_at, existing_item.created_at))
    from public.order_items as existing_item
    left join public.orders as existing_order on existing_order.id = existing_item.order_id
    where existing_item.order_id = target_order_id
      and existing_item.kitchen_round_id = target_kitchen_round_id
    group by
      existing_item.order_id,
      existing_item.kitchen_round_id,
      existing_order.table_id,
      existing_order.opened_by
    on conflict (order_id, kitchen_round_id) do update
    set
      item_ids = (
        select array_agg(distinct receipt_item_id order by receipt_item_id)
        from unnest(public.order_kitchen_rounds.item_ids || excluded.item_ids) as receipt_item_id
      ),
      table_id = coalesce(public.order_kitchen_rounds.table_id, excluded.table_id),
      submitted_by = coalesce(public.order_kitchen_rounds.submitted_by, excluded.submitted_by),
      submitted_at = least(public.order_kitchen_rounds.submitted_at, excluded.submitted_at);
    return;
  end if;

  if jsonb_typeof(payload -> 'items') is distinct from 'array' then
    raise exception 'order items must be an array' using errcode = '22023';
  end if;

  select
    array_agg((entry.value ->> 'id')::uuid order by entry.ordinality),
    min(nullif(entry.value ->> 'submitted_at', '')::timestamptz)
  into target_item_ids, target_submitted_at
  from jsonb_array_elements(payload -> 'items') with ordinality as entry(value, ordinality);

  if coalesce(cardinality(target_item_ids), 0) = 0 then
    raise exception 'at least one order item is required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(target_item_ids) as submitted(submitted_id)
    group by submitted.submitted_id
    having count(*) > 1
  ) then
    raise exception 'order item ids must be unique' using errcode = '22023';
  end if;

  insert into public.orders (
    id,
    table_id,
    table_name,
    waiter_name,
    opened_by,
    opened_by_name,
    status,
    payment_status,
    subtotal,
    service_fee,
    service_rate_pct,
    total,
    order_type,
    order_number,
    price_mode
  )
  values (
    target_order_id,
    target_table_id,
    coalesce(order_payload ->> 'table_name', ''),
    target_waiter_name,
    auth.uid(),
    coalesce(nullif(order_payload ->> 'opened_by_name', ''), target_waiter_name),
    coalesce(order_payload ->> 'status', 'sent_to_kitchen'),
    coalesce(order_payload ->> 'payment_status', 'unpaid'),
    coalesce((order_payload ->> 'subtotal')::integer, 0),
    coalesce((order_payload ->> 'service_fee')::integer, 0),
    coalesce((order_payload ->> 'service_rate_pct')::integer, 20),
    coalesce((order_payload ->> 'total')::integer, 0),
    target_order_type,
    nullif(order_payload ->> 'order_number', ''),
    target_price_mode
  )
  on conflict (id) do update
    set status = excluded.status,
        subtotal = excluded.subtotal,
        service_fee = excluded.service_fee,
        service_rate_pct = excluded.service_rate_pct,
        total = excluded.total,
        order_type = excluded.order_type,
        price_mode = excluded.price_mode,
        updated_at = now()
    where coalesce(public.orders.payment_status, 'unpaid') not in ('paid', 'cancelled')
      and coalesce(public.orders.status, 'sent_to_kitchen') not in ('paid', 'completed', 'cancelled');

  if not exists (
    select 1
    from public.orders
    where id = target_order_id
      and coalesce(payment_status, 'unpaid') not in ('paid', 'cancelled')
      and coalesce(status, 'sent_to_kitchen') not in ('paid', 'completed', 'cancelled')
  ) then
    raise exception 'order % is already paid, completed, cancelled, or unavailable', target_order_id;
  end if;

  insert into public.order_items (
    id,
    order_id,
    menu_item_id,
    name,
    price,
    base_price,
    unit_price,
    price_mode,
    quantity,
    notes,
    selected_options,
    status,
    order_type,
    kitchen_round_id,
    submitted_at,
    item_type,
    is_counter_item
  )
  select
    row.id::uuid,
    target_order_id,
    row.menu_item_id,
    row.name,
    row.price,
    coalesce(row.base_price, row.price, 0),
    coalesce(row.unit_price, row.price, 0),
    coalesce(nullif(row.price_mode, ''), target_price_mode),
    row.quantity,
    coalesce(row.notes, ''),
    coalesce(row.selected_options, '{}'::jsonb),
    coalesce(row.status, 'new'),
    coalesce(row.order_type, target_order_type),
    target_kitchen_round_id,
    coalesce(row.submitted_at, now()),
    coalesce(row.item_type, 'menu'),
    coalesce(row.is_counter_item, false)
  from jsonb_to_recordset(payload -> 'items') as row(
    id text,
    menu_item_id text,
    name text,
    price integer,
    base_price integer,
    unit_price integer,
    price_mode text,
    quantity numeric,
    notes text,
    selected_options jsonb,
    status text,
    order_type text,
    kitchen_round_id text,
    submitted_at timestamptz,
    item_type text,
    is_counter_item boolean
  );

  if target_table_id is not null then
    update public.restaurant_tables
      set status = coalesce(payload ->> 'table_status', 'occupied')
      where id = target_table_id;
  end if;

  insert into public.order_kitchen_rounds (
    order_id,
    kitchen_round_id,
    item_ids,
    table_id,
    submitted_by,
    submitted_at
  ) values (
    target_order_id,
    target_kitchen_round_id,
    target_item_ids,
    target_table_id,
    auth.uid(),
    coalesce(target_submitted_at, now())
  )
  on conflict (order_id, kitchen_round_id) do nothing;
end;
$$;

revoke all on function public.submit_order_to_kitchen(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_order_to_kitchen(jsonb)
  to authenticated, service_role;

-- Health checks use this marker to distinguish a fully installed receipt-aware
-- RPC from the partial state where only the phase-one table/triggers exist.
create or replace function public.kitchen_round_receipts_version()
returns integer
language sql
stable
set search_path = public
as $$
  select 1;
$$;

revoke all on function public.kitchen_round_receipts_version()
  from public, anon, authenticated;
grant execute on function public.kitchen_round_receipts_version()
  to authenticated, service_role;

commit;

-- Backfill outside the trigger-install transaction. It may scan a large order
-- history, but it no longer holds a write-conflicting trigger DDL lock, while
-- the committed INSERT/DELETE triggers cover all concurrent changes.
begin;

insert into public.order_kitchen_rounds (
  order_id,
  kitchen_round_id,
  item_ids,
  table_id,
  submitted_by,
  submitted_at,
  created_at
)
select
  item.order_id,
  item.kitchen_round_id,
  array_agg(distinct item.id order by item.id),
  source_order.table_id,
  source_order.opened_by,
  min(coalesce(item.submitted_at, item.created_at)),
  min(coalesce(item.submitted_at, item.created_at))
from public.order_items as item
left join public.orders as source_order on source_order.id = item.order_id
where nullif(btrim(item.kitchen_round_id), '') is not null
group by
  item.order_id,
  item.kitchen_round_id,
  source_order.table_id,
  source_order.opened_by
on conflict (order_id, kitchen_round_id) do update
set
  item_ids = (
    select array_agg(distinct receipt_item_id order by receipt_item_id)
    from unnest(public.order_kitchen_rounds.item_ids || excluded.item_ids) as receipt_item_id
  ),
  table_id = coalesce(public.order_kitchen_rounds.table_id, excluded.table_id),
  submitted_by = coalesce(public.order_kitchen_rounds.submitted_by, excluded.submitted_by),
  submitted_at = least(public.order_kitchen_rounds.submitted_at, excluded.submitted_at);

commit;

notify pgrst, 'reload schema';
