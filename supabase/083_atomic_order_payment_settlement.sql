-- Settle an entire bill in one PostgreSQL transaction.
--
-- The database, not the browser, recomputes each locked order from its current
-- billable items. Submitted cash/card/terminal/QR payments must match that fresh
-- total after the requested loyalty redemption exactly. Any exception rolls back
-- order status, payment rows, table state, loyalty balance, and wallet history.

create or replace function public.serialize_new_order_for_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- INSERT triggers run before a conflicting upsert locks an existing row. This
  -- serializes both new table rounds and submit_order_to_kitchen upserts with a
  -- settlement for the same table/order.
  perform pg_advisory_xact_lock(hashtextextended(
    case
      when new.table_id is not null then 'pos-table:' || new.table_id
      else 'pos-order:' || new.id
    end,
    0
  ));
  return new;
end;
$$;

drop trigger if exists serialize_new_order_for_payment on public.orders;
create trigger serialize_new_order_for_payment
  before insert on public.orders
  for each row execute function public.serialize_new_order_for_payment();

create or replace function public.guard_paid_order_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_order_id text;
  parent_table_id text;
  parent_is_paid boolean;
begin
  parent_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;

  select o.table_id
    into parent_table_id
    from public.orders o
   where o.id = parent_order_id;

  perform pg_advisory_xact_lock(hashtextextended(
    case
      when parent_table_id is not null then 'pos-table:' || parent_table_id
      else 'pos-order:' || parent_order_id
    end,
    0
  ));

  -- Lock the parent before checking it. Settlement takes the same advisory lock
  -- and row lock before reading items, so an item edit can only happen entirely
  -- before the fresh total or fail after the order becomes paid.
  select (
      o.payment_status = 'paid'
      or o.status in ('paid', 'completed')
      or o.paid_at is not null
    )
    into parent_is_paid
    from public.orders o
   where o.id = parent_order_id
   for update;

  if coalesce(parent_is_paid, false) then
    raise exception 'Items for paid order % are locked', parent_order_id
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_paid_order_items on public.order_items;
create trigger guard_paid_order_items
  before insert or update or delete on public.order_items
  for each row execute function public.guard_paid_order_items();

create or replace function public.settle_orders_payment(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id text := nullif(btrim(payload->>'order_id'), '');
  target_table_id text := nullif(btrim(payload->>'table_id'), '');
  locked_table_id text;
  paid_at_value timestamptz := now();
  order_row public.orders%rowtype;
  card_row public.loyalty_cards%rowtype;
  item_totals record;
  payment_row record;
  summary jsonb;
  summaries jsonb := '[]'::jsonb;
  final_summaries jsonb := '[]'::jsonb;
  validated_payments jsonb := '[]'::jsonb;
  paid_order_ids text[] := array[]::text[];
  payment_methods text[] := array[]::text[];
  card_number text := nullif(btrim(payload->>'loyalty_card_number'), '');
  card_type text;
  payment_method_value text;
  final_payment_method text;
  service_rate integer;
  cashback_percent_value integer := 0;
  requested_redeem bigint := coalesce(nullif(payload->>'loyalty_used_amount', '')::bigint, 0);
  remaining_redeem bigint;
  loyalty_for_order bigint;
  cashback_for_order bigint;
  total_gross bigint := 0;
  total_due bigint := 0;
  total_cashback bigint := 0;
  payment_total bigint := 0;
  payment_amount bigint;
  menu_subtotal bigint;
  counter_subtotal bigint;
  subtotal_value bigint;
  service_fee_value bigint;
  gross_value bigint;
  running_balance bigint;
  affected_table_id text;
  updated_count integer;
begin
  if not public.current_staff_can_write('cashier') then
    raise exception 'Cashier write access is required' using errcode = '42501';
  end if;

  if (target_order_id is null) = (target_table_id is null) then
    raise exception 'Payment requires exactly one order or table' using errcode = '22023';
  end if;

  if requested_redeem < 0 then
    raise exception 'Loyalty redeem amount cannot be negative' using errcode = '22023';
  end if;

  if target_order_id is not null then
    select o.table_id
      into locked_table_id
      from public.orders o
     where o.id = target_order_id;
    if not found then
      raise exception 'Order % does not exist', target_order_id using errcode = 'P0002';
    end if;
  else
    locked_table_id := target_table_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    case
      when locked_table_id is not null then 'pos-table:' || locked_table_id
      else 'pos-order:' || target_order_id
    end,
    0
  ));

  if locked_table_id is not null then
    perform 1
      from public.restaurant_tables t
     where t.id = locked_table_id
     for update;
  end if;

  for order_row in
    select o.*
      from public.orders o
     where (
       (target_order_id is not null and o.id = target_order_id)
       or (target_order_id is null and o.table_id = target_table_id)
     )
       and coalesce(o.payment_status, 'unpaid') <> 'paid'
       and o.paid_at is null
       and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
     order by o.created_at, o.id
     for update
  loop
    if coalesce(order_row.payment_status, 'unpaid') = 'paid'
       or order_row.paid_at is not null
       or coalesce(order_row.status, '') in ('paid', 'completed', 'cancelled') then
      continue;
    end if;

    select
      coalesce(sum(
        coalesce(oi.unit_price, oi.price, 0)::bigint * greatest(coalesce(oi.quantity, 1), 1)::bigint
      ) filter (
        where coalesce(oi.status, '') <> 'cancelled'
          and not (
            coalesce(oi.is_counter_item, false)
            or lower(coalesce(oi.item_type, '')) in ('counter', 'quick', 'cashier_quick')
          )
      ), 0)::bigint as menu_total,
      coalesce(sum(
        coalesce(oi.unit_price, oi.price, 0)::bigint * greatest(coalesce(oi.quantity, 1), 1)::bigint
      ) filter (
        where coalesce(oi.status, '') <> 'cancelled'
          and (
            coalesce(oi.is_counter_item, false)
            or lower(coalesce(oi.item_type, '')) in ('counter', 'quick', 'cashier_quick')
          )
      ), 0)::bigint as counter_total
      into item_totals
      from public.order_items oi
     where oi.order_id = order_row.id;

    menu_subtotal := item_totals.menu_total;
    counter_subtotal := item_totals.counter_total;
    subtotal_value := menu_subtotal + counter_subtotal;
    service_rate := case
      when coalesce(order_row.order_type, 'dine_in') in ('take_away', 'delivery') then 0
      else greatest(0, least(100, coalesce(order_row.service_rate_pct, 20)))
    end;
    service_fee_value := round(menu_subtotal::numeric * service_rate::numeric / 100)::bigint;
    gross_value := subtotal_value + service_fee_value;

    if gross_value <= 0 then
      raise exception 'Order % has no billable amount', order_row.id using errcode = '22023';
    end if;
    if gross_value > 2147483647 then
      raise exception 'Order % total exceeds supported UZS range', order_row.id using errcode = '22003';
    end if;

    total_gross := total_gross + gross_value;
    paid_order_ids := array_append(paid_order_ids, order_row.id);
    summaries := summaries || jsonb_build_array(jsonb_build_object(
      'id', order_row.id,
      'table_id', order_row.table_id,
      'subtotal', subtotal_value,
      'service_rate_pct', service_rate,
      'service_fee', service_fee_value,
      'gross', gross_value
    ));
  end loop;

  if coalesce(array_length(paid_order_ids, 1), 0) = 0 then
    raise exception 'No unpaid orders are available to settle' using errcode = 'P0002';
  end if;

  if card_number is null and requested_redeem > 0 then
    raise exception 'An active loyalty card is required to redeem balance' using errcode = '22023';
  end if;

  if card_number is not null then
    select c.*
      into card_row
      from public.loyalty_cards c
     where c.card_number = card_number
     for update;

    if not found or card_row.is_active = false then
      raise exception 'Loyalty card is not active' using errcode = '22023';
    end if;

    card_type := lower(coalesce(card_row.cashback_type, 'bronze'));
    cashback_percent_value := case card_type
      when 'bronze' then 3
      when 'silver' then 5
      when 'gold' then 7
      when 'premium' then 10
      when 'black' then 15
      when 'platinum' then 30
      when 'special' then 40
      else 0
    end;

    if requested_redeem > coalesce(card_row.balance, 0) then
      raise exception 'Loyalty redeem amount exceeds available balance' using errcode = '22023';
    end if;
  end if;

  if requested_redeem > total_gross then
    raise exception 'Loyalty redeem amount exceeds remaining bill' using errcode = '22023';
  end if;

  remaining_redeem := requested_redeem;
  for summary in select value from jsonb_array_elements(summaries)
  loop
    gross_value := (summary->>'gross')::bigint;
    loyalty_for_order := least(remaining_redeem, gross_value);
    remaining_redeem := remaining_redeem - loyalty_for_order;
    cashback_for_order := floor(
      (gross_value - loyalty_for_order)::numeric * cashback_percent_value::numeric / 100
    )::bigint;
    total_cashback := total_cashback + cashback_for_order;
    total_due := total_due + gross_value - loyalty_for_order;
    final_summaries := final_summaries || jsonb_build_array(
      summary || jsonb_build_object(
        'loyalty_used', loyalty_for_order,
        'cashback', cashback_for_order,
        'due', gross_value - loyalty_for_order
      )
    );
  end loop;

  if jsonb_typeof(payload->'payments') is distinct from 'array' then
    raise exception 'Payment amounts are required' using errcode = '22023';
  end if;

  for payment_row in
    select entry.value, entry.ordinality
      from jsonb_array_elements(payload->'payments') with ordinality as entry(value, ordinality)
     order by entry.ordinality
  loop
    payment_method_value := lower(btrim(coalesce(payment_row.value->>'method', '')));
    if payment_method_value not in ('cash', 'card', 'terminal', 'qr', 'other') then
      raise exception 'Unsupported payment method: %', payment_method_value using errcode = '22023';
    end if;

    payment_amount := nullif(payment_row.value->>'amount', '')::bigint;
    if payment_amount is null or payment_amount <= 0 or payment_amount > 2147483647 then
      raise exception 'Payment amount must be a positive supported UZS integer' using errcode = '22023';
    end if;

    payment_total := payment_total + payment_amount;
    if not (payment_method_value = any(payment_methods)) then
      payment_methods := array_append(payment_methods, payment_method_value);
    end if;
    validated_payments := validated_payments || jsonb_build_array(jsonb_build_object(
      'method', payment_method_value,
      'amount', payment_amount
    ));
  end loop;

  if payment_total <> total_due then
    raise exception 'Payment amount mismatch: expected %, received %', total_due, payment_total
      using errcode = '22023',
            detail = jsonb_build_object('expected_total', total_due, 'received_total', payment_total)::text;
  end if;

  final_payment_method := case
    when total_due = 0 and requested_redeem > 0 then 'loyalty_card'
    when coalesce(array_length(payment_methods, 1), 0) = 1 then payment_methods[1]
    else 'mixed'
  end;

  -- All validation is complete. Every write below remains in this function's
  -- transaction; PostgreSQL rolls all of it back if any statement or trigger fails.
  delete from public.order_payments where order_id = any(paid_order_ids);

  for summary in select value from jsonb_array_elements(final_summaries)
  loop
    update public.orders
       set status = 'paid',
           payment_status = 'paid',
           paid_at = paid_at_value,
           subtotal = (summary->>'subtotal')::integer,
           service_fee = (summary->>'service_fee')::integer,
           service_rate_pct = (summary->>'service_rate_pct')::integer,
           total = (summary->>'due')::integer,
           discounted_subtotal = (summary->>'due')::integer,
           loyalty_discount_pct = 0,
           loyalty_discount_amount = (summary->>'loyalty_used')::integer,
           loyalty_used_amount = (summary->>'loyalty_used')::integer,
           loyalty_redeem_amount = (summary->>'loyalty_used')::integer,
           loyalty_card_number = card_number,
           cashback_earned = (summary->>'cashback')::integer,
           cashback_percent = cashback_percent_value,
           payment_method = final_payment_method
     where id = summary->>'id'
       and coalesce(payment_status, 'unpaid') <> 'paid'
       and paid_at is null;

    get diagnostics updated_count = row_count;
    if updated_count <> 1 then
      raise exception 'Order % changed during settlement', summary->>'id' using errcode = '40001';
    end if;
  end loop;

  if total_due > 0 then
    with order_values as (
      select
        row.value->>'id' as order_id,
        (row.value->>'due')::bigint as amount,
        row.ordinality
      from jsonb_array_elements(final_summaries) with ordinality as row(value, ordinality)
    ), order_ranges as (
      select
        order_id,
        sum(amount) over (order by ordinality) - amount as range_start,
        sum(amount) over (order by ordinality) as range_end
      from order_values
    ), payment_values as (
      select
        row.value->>'method' as method,
        (row.value->>'amount')::bigint as amount,
        row.ordinality
      from jsonb_array_elements(validated_payments) with ordinality as row(value, ordinality)
    ), payment_ranges as (
      select
        method,
        sum(amount) over (order by ordinality) - amount as range_start,
        sum(amount) over (order by ordinality) as range_end
      from payment_values
    )
    insert into public.order_payments (order_id, method, amount, created_by, created_at)
    select
      orders.order_id,
      payments.method,
      (least(orders.range_end, payments.range_end) - greatest(orders.range_start, payments.range_start))::integer,
      auth.uid(),
      paid_at_value
    from order_ranges orders
    cross join payment_ranges payments
    where least(orders.range_end, payments.range_end) > greatest(orders.range_start, payments.range_start);
  end if;

  if card_number is not null then
    running_balance := card_row.balance;

    for summary in select value from jsonb_array_elements(final_summaries)
    loop
      loyalty_for_order := (summary->>'loyalty_used')::bigint;
      if loyalty_for_order > 0 then
        insert into public.loyalty_transactions (
          loyalty_card_id, order_id, type, amount, balance_before, balance_after,
          reason, created_by, card_number_at_transaction,
          customer_name_at_transaction, phone_number_at_transaction, created_at
        ) values (
          card_row.id, summary->>'id', 'redeemed', -loyalty_for_order::integer,
          running_balance::integer, (running_balance - loyalty_for_order)::integer,
          'Loyalty used for order payment', auth.uid(), card_row.card_number,
          coalesce(card_row.customer_name, ''), coalesce(card_row.phone_number, ''), paid_at_value
        );
        running_balance := running_balance - loyalty_for_order;
      end if;
    end loop;

    for summary in select value from jsonb_array_elements(final_summaries)
    loop
      cashback_for_order := (summary->>'cashback')::bigint;
      if cashback_for_order > 0 then
        insert into public.loyalty_transactions (
          loyalty_card_id, order_id, type, amount, balance_before, balance_after,
          reason, created_by, cashback_percent_used, card_type_at_transaction,
          card_number_at_transaction, customer_name_at_transaction,
          phone_number_at_transaction, created_at
        ) values (
          card_row.id, summary->>'id', 'cashback_earned', cashback_for_order::integer,
          running_balance::integer, (running_balance + cashback_for_order)::integer,
          'Cashback ' || cashback_percent_value || '%', auth.uid(), cashback_percent_value,
          card_type, card_row.card_number, coalesce(card_row.customer_name, ''),
          coalesce(card_row.phone_number, ''), paid_at_value
        );
        running_balance := running_balance + cashback_for_order;
      end if;
    end loop;

    if running_balance < 0 or running_balance > 2147483647 then
      raise exception 'Final loyalty balance exceeds supported range' using errcode = '22003';
    end if;

    update public.loyalty_cards
       set balance = running_balance::integer,
           total_earned = total_earned + total_cashback::integer,
           total_redeemed = total_redeemed + requested_redeem::integer,
           updated_at = paid_at_value
     where id = card_row.id;
  end if;

  for affected_table_id in
    select distinct nullif(value->>'table_id', '')
      from jsonb_array_elements(final_summaries)
     where nullif(value->>'table_id', '') is not null
  loop
    if not exists (
      select 1
        from public.orders remaining
       where remaining.table_id = affected_table_id
         and coalesce(remaining.payment_status, 'unpaid') <> 'paid'
         and remaining.paid_at is null
         and coalesce(remaining.status, '') not in ('paid', 'completed', 'cancelled')
    ) then
      update public.restaurant_tables
         set status = 'available',
             reserved_for_name = '',
             reserved_for_phone = '',
             reserved_at = null,
             reserved_until = null,
             reservation_notes = ''
       where id = affected_table_id;
    end if;
  end loop;

  return jsonb_build_object(
    'order_ids', to_jsonb(paid_order_ids),
    'paid_at', paid_at_value,
    'gross_total', total_gross,
    'total_due', total_due,
    'loyalty_used_amount', requested_redeem,
    'cashback_earned', total_cashback,
    'payment_method', final_payment_method
  );
end;
$$;

revoke all on function public.settle_orders_payment(jsonb) from public;
grant execute on function public.settle_orders_payment(jsonb) to authenticated;
