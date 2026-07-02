-- Track who opened and completed POS orders for operational accountability.

alter table public.orders
  add column if not exists opened_by uuid references public.profiles(id) on delete set null,
  add column if not exists opened_by_name text not null default '',
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists completed_by_name text not null default '';

do $$
declare
  had_payment_guard boolean := false;
begin
  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'guard_and_audit_order_payment'
      and not tgisinternal
  ) into had_payment_guard;

  if had_payment_guard then
    execute 'alter table public.orders disable trigger guard_and_audit_order_payment';
  end if;

  update public.orders
  set opened_by_name = waiter_name
  where coalesce(opened_by_name, '') = ''
    and coalesce(waiter_name, '') <> '';

  with latest_payment_actor as (
    select distinct on (audit.order_id)
      audit.order_id,
      profile.id as actor_profile_id,
      coalesce(nullif(profile.full_name, ''), profile.email, audit.actor_id::text) as actor_name
    from public.order_payment_audit audit
    left join public.profiles profile on profile.id = audit.actor_id
    where audit.action = 'mark_paid'
      and audit.actor_id is not null
    order by audit.order_id, audit.changed_at desc
  )
  update public.orders orders
  set
    completed_by = coalesce(orders.completed_by, latest_payment_actor.actor_profile_id),
    completed_by_name = case
      when coalesce(orders.completed_by_name, '') = '' then latest_payment_actor.actor_name
      else orders.completed_by_name
    end
  from latest_payment_actor
  where orders.id = latest_payment_actor.order_id
    and (orders.completed_by is null or coalesce(orders.completed_by_name, '') = '');

  if had_payment_guard then
    execute 'alter table public.orders enable trigger guard_and_audit_order_payment';
  end if;
exception
  when others then
    if had_payment_guard then
      execute 'alter table public.orders enable trigger guard_and_audit_order_payment';
    end if;
    raise;
end $$;

create index if not exists idx_orders_opened_by on public.orders(opened_by);
create index if not exists idx_orders_completed_by on public.orders(completed_by);

create or replace function public.set_order_actor_tracking_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile_id uuid;
  actor_name text;
  old_paid boolean := false;
  new_paid boolean := false;
begin
  if actor_id is not null then
    select id, coalesce(nullif(full_name, ''), email, actor_id::text)
      into actor_profile_id, actor_name
    from public.profiles
    where id = actor_id;
  end if;

  if tg_op = 'INSERT' then
    if actor_id is not null then
      new.opened_by := actor_profile_id;
    end if;

    new.opened_by_name := coalesce(
      actor_name,
      nullif(new.opened_by_name, ''),
      nullif(new.waiter_name, ''),
      'Waiter'
    );

    return new;
  end if;

  old_paid := old.payment_status = 'paid' or old.status in ('paid', 'completed') or old.paid_at is not null;
  new_paid := new.payment_status = 'paid' or new.status in ('paid', 'completed') or new.paid_at is not null;

  if not old_paid and new_paid then
    if actor_id is not null then
      new.completed_by := actor_profile_id;
    end if;

    new.completed_by_name := coalesce(
      actor_name,
      nullif(new.completed_by_name, ''),
      'Cashier'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists set_order_actor_tracking_fields on public.orders;
create trigger set_order_actor_tracking_fields
  before insert or update on public.orders
  for each row
  execute function public.set_order_actor_tracking_fields();

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
