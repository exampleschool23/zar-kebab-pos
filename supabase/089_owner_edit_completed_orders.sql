-- Owner-only correction workflow for completed orders.
--
-- Paid orders remain immutable during ordinary writes. This migration adds one
-- audited SECURITY DEFINER RPC that reverses payment/loyalty side effects and
-- reopens the selected orders in Cashier, where their items can be corrected
-- and the bill can be settled again through the normal atomic payment flow.

create or replace function public.guard_and_audit_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_paid boolean;
  new_paid boolean;
  money_changed boolean;
  status_changed boolean;
  owner_reopen boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  old_paid := old.payment_status = 'paid' or old.status in ('paid', 'completed') or old.paid_at is not null;
  new_paid := new.payment_status = 'paid' or new.status in ('paid', 'completed') or new.paid_at is not null;

  money_changed :=
    old.subtotal is distinct from new.subtotal or
    old.service_fee is distinct from new.service_fee or
    old.service_rate_pct is distinct from new.service_rate_pct or
    old.total is distinct from new.total or
    coalesce(old.loyalty_discount_pct, 0) is distinct from coalesce(new.loyalty_discount_pct, 0) or
    coalesce(old.loyalty_discount_amount, 0) is distinct from coalesce(new.loyalty_discount_amount, 0);

  status_changed :=
    old.status is distinct from new.status or
    old.payment_status is distinct from new.payment_status or
    old.paid_at is distinct from new.paid_at or
    old.payment_method is distinct from new.payment_method;

  owner_reopen :=
    coalesce(current_setting('app.owner_paid_order_reopen', true), '') = 'on'
    and public.current_staff_has_role(array['owner']);

  if old_paid and money_changed and not owner_reopen then
    raise exception 'Paid order % financial fields are locked', old.id
      using errcode = '23514';
  end if;

  if old_paid and not new_paid and not owner_reopen then
    raise exception 'Paid order % cannot be reopened by direct update', old.id
      using errcode = '23514';
  end if;

  if new_paid and new.paid_at is null then
    new.paid_at := now();
  end if;

  if money_changed or status_changed then
    insert into public.order_payment_audit (
      order_id,
      actor_id,
      action,
      old_payment_status,
      new_payment_status,
      old_status,
      new_status,
      old_total,
      new_total,
      old_subtotal,
      new_subtotal,
      old_service_fee,
      new_service_fee,
      old_service_rate_pct,
      new_service_rate_pct,
      old_discount_pct,
      new_discount_pct,
      old_discount_amount,
      new_discount_amount,
      old_payment_method,
      new_payment_method
    ) values (
      new.id,
      auth.uid(),
      case
        when not old_paid and new_paid then 'mark_paid'
        when old_paid and not new_paid then 'reopen_paid_order'
        when money_changed then 'payment_fields_changed'
        else 'status_changed'
      end,
      old.payment_status,
      new.payment_status,
      old.status,
      new.status,
      old.total,
      new.total,
      old.subtotal,
      new.subtotal,
      old.service_fee,
      new.service_fee,
      old.service_rate_pct,
      new.service_rate_pct,
      old.loyalty_discount_pct,
      new.loyalty_discount_pct,
      old.loyalty_discount_amount,
      new.loyalty_discount_amount,
      old.payment_method,
      new.payment_method
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.reopen_paid_orders_owner(p_order_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
<<reopen_paid_orders_owner>>
declare
  target_order_ids text[];
  target_order_id text;
  order_row public.orders%rowtype;
  loyalty_tx public.loyalty_transactions%rowtype;
  loyalty_card_id uuid;
  loyalty_card_ids uuid[] := array[]::uuid[];
  loyalty_start_balances integer[] := array[]::integer[];
  card_index integer;
  start_balance integer;
  running_balance integer;
  balance_before integer;
  balance_after integer;
  balance_delta integer;
  total_earned integer;
  total_redeemed integer;
  target_table_id text;
  menu_subtotal bigint;
  counter_subtotal bigint;
  subtotal_value bigint;
  service_rate_value integer;
  service_fee_value bigint;
  gross_value bigint;
begin
  if not public.current_staff_has_role(array['owner']) then
    raise exception 'Only owner can edit completed orders' using errcode = '42501';
  end if;

  select array_agg(distinct value order by value)
    into target_order_ids
    from unnest(coalesce(p_order_ids, array[]::text[])) as requested(value)
   where nullif(btrim(value), '') is not null;

  if coalesce(cardinality(target_order_ids), 0) = 0 then
    raise exception 'At least one order is required' using errcode = '22023';
  end if;

  -- Settlement takes the same advisory key before locking an order. Matching
  -- that order prevents a reopen from racing a payment or kitchen write.
  foreach target_order_id in array target_order_ids
  loop
    select table_id
      into target_table_id
      from public.orders
     where id = target_order_id;

    if not found then
      raise exception 'Order % not found', target_order_id using errcode = 'P0002';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      case
        when target_table_id is not null then 'pos-table:' || target_table_id
        else 'pos-order:' || target_order_id
      end,
      0
    ));

    select *
      into order_row
      from public.orders
     where id = target_order_id
     for update;

    if not (
      order_row.payment_status = 'paid'
      or order_row.status in ('paid', 'completed')
      or order_row.paid_at is not null
    ) then
      raise exception 'Order % is not completed', target_order_id using errcode = '22023';
    end if;
  end loop;

  -- Remember the balance immediately before each affected card's first order
  -- transaction, then replay the remaining immutable deltas after removal.
  for loyalty_card_id, start_balance in
    select distinct on (tx.loyalty_card_id)
      tx.loyalty_card_id,
      coalesce(tx.balance_before, 0)
    from public.loyalty_transactions tx
    where tx.order_id = any(target_order_ids)
      and tx.loyalty_card_id is not null
    order by tx.loyalty_card_id, tx.created_at asc, tx.id asc
  loop
    loyalty_card_ids := array_append(loyalty_card_ids, loyalty_card_id);
    loyalty_start_balances := array_append(loyalty_start_balances, start_balance);
  end loop;

  delete from public.loyalty_transactions
   where order_id = any(target_order_ids);

  if coalesce(cardinality(loyalty_card_ids), 0) > 0 then
    for card_index in 1..cardinality(loyalty_card_ids)
    loop
      loyalty_card_id := loyalty_card_ids[card_index];
      start_balance := loyalty_start_balances[card_index];

      perform 1
        from public.loyalty_cards
       where id = loyalty_card_id
       for update;

      running_balance := coalesce(start_balance, 0);
      total_earned := running_balance;
      total_redeemed := 0;

      for loyalty_tx in
        select tx.*
          from public.loyalty_transactions tx
         where tx.loyalty_card_id = reopen_paid_orders_owner.loyalty_card_id
         order by tx.created_at asc, tx.id asc
      loop
        if loyalty_tx.balance_before is not null and loyalty_tx.balance_after is not null then
          balance_delta := loyalty_tx.balance_after - loyalty_tx.balance_before;
        elsif loyalty_tx.type = 'redeemed' then
          balance_delta := -abs(loyalty_tx.amount);
        else
          balance_delta := loyalty_tx.amount;
        end if;

        balance_before := running_balance;
        balance_after := balance_before + balance_delta;
        if balance_after < 0 then
          raise exception 'Editing this order would make loyalty balance negative' using errcode = '23514';
        end if;

        update public.loyalty_transactions
           set balance_before = reopen_paid_orders_owner.balance_before,
               balance_after = reopen_paid_orders_owner.balance_after
         where id = loyalty_tx.id;

        running_balance := balance_after;
        if balance_delta > 0 then
          total_earned := total_earned + balance_delta;
        elsif balance_delta < 0 then
          total_redeemed := total_redeemed + abs(balance_delta);
        end if;
      end loop;

      update public.loyalty_cards
         set balance = running_balance,
             total_earned = reopen_paid_orders_owner.total_earned,
             total_redeemed = reopen_paid_orders_owner.total_redeemed,
             updated_at = now()
       where id = loyalty_card_id;
    end loop;
  end if;

  delete from public.order_payments
   where order_id = any(target_order_ids);

  -- The paid-order guard only honors this transaction-local flag for an owner.
  perform set_config('app.owner_paid_order_reopen', 'on', true);

  foreach target_order_id in array target_order_ids
  loop
    select *
      into order_row
      from public.orders
     where id = target_order_id
     for update;

    select
      coalesce(sum(
        coalesce(oi.unit_price, oi.price, 0)::bigint * greatest(coalesce(oi.quantity, 1), 1)::bigint
      ) filter (
        where coalesce(oi.status, '') <> 'cancelled'
          and not (
            coalesce(oi.is_counter_item, false)
            or lower(coalesce(oi.item_type, '')) in ('counter', 'quick', 'cashier_quick')
          )
      ), 0)::bigint,
      coalesce(sum(
        coalesce(oi.unit_price, oi.price, 0)::bigint * greatest(coalesce(oi.quantity, 1), 1)::bigint
      ) filter (
        where coalesce(oi.status, '') <> 'cancelled'
          and (
            coalesce(oi.is_counter_item, false)
            or lower(coalesce(oi.item_type, '')) in ('counter', 'quick', 'cashier_quick')
          )
      ), 0)::bigint
      into menu_subtotal, counter_subtotal
      from public.order_items oi
     where oi.order_id = target_order_id;

    subtotal_value := menu_subtotal + counter_subtotal;
    service_rate_value := case
      when coalesce(order_row.order_type, 'dine_in') in ('take_away', 'delivery') then 0
      else greatest(0, least(100, coalesce(order_row.service_rate_pct, 20)))
    end;
    service_fee_value := round(menu_subtotal::numeric * service_rate_value::numeric / 100)::bigint;
    gross_value := subtotal_value + service_fee_value;

    if gross_value <= 0 or gross_value > 2147483647 then
      raise exception 'Order % has an invalid billable total', target_order_id using errcode = '22023';
    end if;

    update public.orders
       set status = 'needs_bill',
           payment_status = 'unpaid',
           paid_at = null,
           payment_method = null,
           subtotal = subtotal_value::integer,
           service_rate_pct = service_rate_value,
           service_fee = service_fee_value::integer,
           total = gross_value::integer,
           discounted_subtotal = gross_value::integer,
           loyalty_discount_pct = 0,
           loyalty_discount_amount = 0,
           loyalty_used_amount = 0,
           loyalty_redeem_amount = 0,
           loyalty_card_number = null,
           cashback_earned = 0,
           cashback_percent = 0,
           completed_by = null,
           completed_by_name = ''
     where id = target_order_id;
  end loop;

  update public.restaurant_tables table_row
     set status = 'needs_bill',
         reserved_for_name = '',
         reserved_for_phone = '',
         reserved_at = null,
         reserved_until = null,
         reservation_notes = '',
         updated_at = now()
   where table_row.id in (
     select distinct table_id
       from public.orders
      where id = any(target_order_ids)
        and table_id is not null
   );

  return jsonb_build_object(
    'orderIds', to_jsonb(target_order_ids),
    'reopened', cardinality(target_order_ids)
  );
end;
$$;

revoke all on function public.reopen_paid_orders_owner(text[]) from public;
revoke all on function public.reopen_paid_orders_owner(text[]) from anon;
grant execute on function public.reopen_paid_orders_owner(text[]) to authenticated;

comment on function public.reopen_paid_orders_owner(text[]) is
  'Owner-only audited reversal that reopens completed orders for correction and repayment.';
