-- Persist waiter submission rounds so cook checks stay split after reloads.

alter table public.order_items
  add column if not exists kitchen_round_id text;

alter table public.order_items
  add column if not exists submitted_at timestamptz;

update public.order_items
  set submitted_at = created_at
  where submitted_at is null;

create index if not exists idx_order_items_kitchen_round
  on public.order_items(order_id, kitchen_round_id, submitted_at);

create or replace function public.submit_order_to_kitchen(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_payload jsonb := payload -> 'order';
  target_order_id text := order_payload ->> 'id';
  target_table_id text := nullif(order_payload ->> 'table_id', '');
  target_order_type text := coalesce(nullif(order_payload ->> 'order_type', ''), 'dine_in');
begin
  if target_order_id is null or target_order_id = '' then
    raise exception 'order id is required';
  end if;

  insert into public.orders (
    id,
    table_id,
    table_name,
    waiter_name,
    status,
    payment_status,
    subtotal,
    service_fee,
    service_rate_pct,
    total,
    order_type,
    order_number
  )
  values (
    target_order_id,
    target_table_id,
    coalesce(order_payload ->> 'table_name', ''),
    coalesce(order_payload ->> 'waiter_name', 'Waiter'),
    coalesce(order_payload ->> 'status', 'sent_to_kitchen'),
    coalesce(order_payload ->> 'payment_status', 'unpaid'),
    coalesce((order_payload ->> 'subtotal')::integer, 0),
    coalesce((order_payload ->> 'service_fee')::integer, 0),
    coalesce((order_payload ->> 'service_rate_pct')::integer, 20),
    coalesce((order_payload ->> 'total')::integer, 0),
    target_order_type,
    nullif(order_payload ->> 'order_number', '')
  )
  on conflict (id) do update
    set status = excluded.status,
        subtotal = excluded.subtotal,
        service_fee = excluded.service_fee,
        service_rate_pct = excluded.service_rate_pct,
        total = excluded.total,
        order_type = excluded.order_type,
        updated_at = now()
    where public.orders.payment_status <> 'paid';

  if not exists (
    select 1
    from public.orders
    where id = target_order_id
      and payment_status <> 'paid'
  ) then
    raise exception 'order % is already paid or unavailable', target_order_id;
  end if;

  insert into public.order_items (
    id,
    order_id,
    menu_item_id,
    name,
    price,
    quantity,
    notes,
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
    row.quantity,
    coalesce(row.notes, ''),
    coalesce(row.status, 'new'),
    coalesce(row.order_type, target_order_type),
    nullif(row.kitchen_round_id, ''),
    coalesce(row.submitted_at, now()),
    coalesce(row.item_type, 'menu'),
    coalesce(row.is_counter_item, false)
  from jsonb_to_recordset(coalesce(payload -> 'items', '[]'::jsonb)) as row(
    id text,
    menu_item_id text,
    name text,
    price integer,
    quantity integer,
    notes text,
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
end;
$$;
