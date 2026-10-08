-- Treat a waiter retry of the same kitchen round as the same submission.
-- This prevents a lost/late HTTP response from creating a second copy when the
-- waiter taps Send again with the retained client attempt.

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
  target_price_mode text := coalesce(nullif(order_payload ->> 'price_mode', ''), 'regular');
  target_waiter_name text := coalesce(order_payload ->> 'waiter_name', 'Waiter');
  target_kitchen_round_id text := coalesce(
    nullif(payload ->> 'kitchen_round_id', ''),
    nullif(payload #>> '{items,0,kitchen_round_id}', '')
  );
begin
  if target_order_id is null or target_order_id = '' then
    raise exception 'order id is required';
  end if;

  if target_price_mode not in ('regular', 'tourist') then
    target_price_mode := 'regular';
  end if;

  -- Serialize retries with the first submission and with cashier settlement.
  perform pg_advisory_xact_lock(hashtextextended(
    case
      when target_table_id is not null then 'pos-table:' || target_table_id
      else 'pos-order:' || target_order_id
    end,
    0
  ));

  if target_kitchen_round_id is not null and exists (
    select 1
    from public.order_items
    where order_id = target_order_id
      and kitchen_round_id = target_kitchen_round_id
  ) then
    if exists (
      select 1
      from public.orders
      where id = target_order_id
        and payment_status <> 'paid'
    ) then
      return;
    end if;
    raise exception 'order % is already paid or unavailable', target_order_id;
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
    (select profile.id from public.profiles profile where profile.id = auth.uid()),
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
    nullif(row.kitchen_round_id, ''),
    coalesce(row.submitted_at, now()),
    coalesce(row.item_type, 'menu'),
    coalesce(row.is_counter_item, false)
  from jsonb_to_recordset(coalesce(payload -> 'items', '[]'::jsonb)) as row(
    id text,
    menu_item_id text,
    name text,
    price integer,
    base_price integer,
    unit_price integer,
    price_mode text,
    quantity integer,
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
end;
$$;

notify pgrst, 'reload schema';
