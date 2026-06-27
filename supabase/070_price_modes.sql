-- Add regular/tourist price modes without duplicating menu items.

alter table public.orders
  add column if not exists price_mode text not null default 'regular';

alter table public.order_items
  add column if not exists base_price integer,
  add column if not exists unit_price integer,
  add column if not exists price_mode text not null default 'regular';

do $$
declare
  had_paid_order_items_guard boolean := false;
begin
  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.order_items'::regclass
      and tgname = 'guard_paid_order_items'
      and not tgisinternal
  ) into had_paid_order_items_guard;

  if had_paid_order_items_guard then
    execute 'alter table public.order_items disable trigger guard_paid_order_items';
  end if;

  update public.order_items oi
  set
    base_price = coalesce(oi.base_price, oi.price, 0),
    unit_price = coalesce(oi.unit_price, oi.price, 0),
    price_mode = coalesce(nullif(oi.price_mode, ''), o.price_mode, 'regular')
  from public.orders o
  where oi.order_id = o.id;

  update public.order_items
  set
    base_price = coalesce(base_price, price, 0),
    unit_price = coalesce(unit_price, price, 0),
    price_mode = coalesce(nullif(price_mode, ''), 'regular')
  where base_price is null
     or unit_price is null
     or price_mode is null
     or price_mode = '';

  if had_paid_order_items_guard then
    execute 'alter table public.order_items enable trigger guard_paid_order_items';
  end if;
exception
  when others then
    if had_paid_order_items_guard then
      execute 'alter table public.order_items enable trigger guard_paid_order_items';
    end if;
    raise;
end $$;

alter table public.order_items
  alter column base_price set not null,
  alter column base_price set default 0,
  alter column unit_price set not null,
  alter column unit_price set default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_price_mode_check') then
    alter table public.orders
      add constraint orders_price_mode_check check (price_mode in ('regular', 'tourist')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_price_mode_check') then
    alter table public.order_items
      add constraint order_items_price_mode_check check (price_mode in ('regular', 'tourist')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_base_price_nonnegative') then
    alter table public.order_items
      add constraint order_items_base_price_nonnegative check (base_price >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_unit_price_nonnegative') then
    alter table public.order_items
      add constraint order_items_unit_price_nonnegative check (unit_price >= 0) not valid;
  end if;
end $$;

create index if not exists idx_orders_price_mode on public.orders(price_mode);
create index if not exists idx_order_items_price_mode on public.order_items(price_mode);

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
begin
  if target_order_id is null or target_order_id = '' then
    raise exception 'order id is required';
  end if;

  if target_price_mode not in ('regular', 'tourist') then
    target_price_mode := 'regular';
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
    order_number,
    price_mode
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
    coalesce(row.unit_price, row.price, 0),
    coalesce(row.base_price, row.price, 0),
    coalesce(row.unit_price, row.price, 0),
    case when row.price_mode in ('regular', 'tourist') then row.price_mode else target_price_mode end,
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
