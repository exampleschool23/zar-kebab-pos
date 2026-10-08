-- Create Telegram orders and their items in one database transaction.
-- The API validates menu availability/prices before calling this service-role-only
-- RPC. Any item failure rolls the order insert back, preventing empty shells.

create or replace function public.create_telegram_order(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  order_payload jsonb := payload -> 'order';
  items_payload jsonb := payload -> 'items';
  target_order_id text := nullif(btrim(order_payload ->> 'id'), '');
  inserted_order public.orders%rowtype;
  inserted_item_count integer := 0;
begin
  if target_order_id is null then
    raise exception 'Telegram order id is required' using errcode = '22023';
  end if;

  if jsonb_typeof(order_payload) is distinct from 'object'
     or coalesce(order_payload ->> 'source', '') <> 'telegram' then
    raise exception 'A valid Telegram order payload is required' using errcode = '22023';
  end if;

  if jsonb_typeof(items_payload) is distinct from 'array'
     or jsonb_array_length(items_payload) = 0 then
    raise exception 'Telegram order items are required' using errcode = '22023';
  end if;

  insert into public.orders (
    id,
    order_number,
    table_id,
    table_name,
    waiter_name,
    status,
    payment_status,
    payment_method,
    order_type,
    source,
    telegram_user_id,
    customer_id,
    notes,
    loyalty_card_number,
    loyalty_redeem_amount,
    loyalty_used_amount,
    loyalty_discount_amount,
    subtotal,
    service_fee,
    service_rate_pct,
    total,
    price_mode
  ) values (
    target_order_id,
    nullif(order_payload ->> 'order_number', ''),
    null,
    coalesce(order_payload ->> 'table_name', 'Telegram'),
    'Telegram',
    'sent_to_kitchen',
    'unpaid',
    coalesce(nullif(order_payload ->> 'payment_method', ''), 'pay_at_cashier'),
    coalesce(nullif(order_payload ->> 'order_type', ''), 'take_away'),
    'telegram',
    nullif(order_payload ->> 'telegram_user_id', ''),
    nullif(order_payload ->> 'customer_id', '')::uuid,
    left(coalesce(order_payload ->> 'notes', ''), 1000),
    nullif(order_payload ->> 'loyalty_card_number', ''),
    coalesce((order_payload ->> 'loyalty_redeem_amount')::integer, 0),
    coalesce((order_payload ->> 'loyalty_used_amount')::integer, 0),
    coalesce((order_payload ->> 'loyalty_discount_amount')::integer, 0),
    coalesce((order_payload ->> 'subtotal')::integer, 0),
    coalesce((order_payload ->> 'service_fee')::integer, 0),
    coalesce((order_payload ->> 'service_rate_pct')::integer, 0),
    coalesce((order_payload ->> 'total')::integer, 0),
    coalesce(nullif(order_payload ->> 'price_mode', ''), 'regular')
  )
  returning * into inserted_order;

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
    item_type,
    is_counter_item,
    submitted_at
  )
  select
    row.id::uuid,
    target_order_id,
    row.menu_item_id,
    row.name,
    row.price,
    coalesce(row.base_price, row.price),
    coalesce(row.unit_price, row.price),
    coalesce(nullif(row.price_mode, ''), 'regular'),
    row.quantity,
    left(coalesce(row.notes, ''), 500),
    coalesce(row.selected_options, '{}'::jsonb),
    'new',
    coalesce(nullif(row.order_type, ''), inserted_order.order_type),
    'menu',
    false,
    now()
  from jsonb_to_recordset(items_payload) as row(
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
    order_type text
  );

  get diagnostics inserted_item_count = row_count;
  if inserted_item_count <> jsonb_array_length(items_payload) then
    raise exception 'Not every Telegram order item was inserted' using errcode = '23514';
  end if;

  return to_jsonb(inserted_order);
end;
$$;

revoke all on function public.create_telegram_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_telegram_order(jsonb) to service_role;

notify pgrst, 'reload schema';
