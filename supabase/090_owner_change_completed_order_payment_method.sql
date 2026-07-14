-- Replace the broad completed-order reopen workflow with a narrow owner-only
-- payment-method correction. Items, totals, status, paid_at, and loyalty fields
-- remain immutable. Existing payment allocation amounts are preserved.

drop function if exists public.reopen_paid_orders_owner(text[]);

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

  if old_paid and money_changed then
    raise exception 'Paid order % financial fields are locked', old.id
      using errcode = '23514';
  end if;

  if old_paid and not new_paid then
    raise exception 'Paid order % cannot be reopened by direct update', old.id
      using errcode = '23514';
  end if;

  if old_paid
     and old.payment_method is distinct from new.payment_method
     and not public.current_staff_has_role(array['owner']) then
    raise exception 'Only owner can change a completed order payment method'
      using errcode = '42501';
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
        when old.payment_method is distinct from new.payment_method
          and old.status is not distinct from new.status
          and old.payment_status is not distinct from new.payment_status
          and old.paid_at is not distinct from new.paid_at
          then 'payment_method_changed'
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

create or replace function public.change_paid_order_payment_method_owner(
  p_order_ids text[],
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_ids text[];
  target_order_id text;
  target_table_id text;
  normalized_method text := lower(btrim(coalesce(p_payment_method, '')));
  order_row public.orders%rowtype;
  changed_payment_rows integer := 0;
  row_count_value integer := 0;
begin
  if not public.current_staff_has_role(array['owner']) then
    raise exception 'Only owner can change a completed order payment method' using errcode = '42501';
  end if;

  if normalized_method not in ('cash', 'card', 'terminal', 'qr') then
    raise exception 'Unsupported payment method: %', normalized_method using errcode = '22023';
  end if;

  select array_agg(distinct value order by value)
    into target_order_ids
    from unnest(coalesce(p_order_ids, array[]::text[])) as requested(value)
   where nullif(btrim(value), '') is not null;

  if coalesce(cardinality(target_order_ids), 0) = 0 then
    raise exception 'At least one order is required' using errcode = '22023';
  end if;

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

  -- Preserve every payment amount and any loyalty allocation. Only the method
  -- on non-loyalty payment rows changes.
  update public.order_payments
     set method = normalized_method
   where order_id = any(target_order_ids)
     and method <> 'loyalty_card';
  get diagnostics changed_payment_rows = row_count;

  update public.orders
     set payment_method = normalized_method
   where id = any(target_order_ids);
  get diagnostics row_count_value = row_count;

  if row_count_value <> cardinality(target_order_ids) then
    raise exception 'One or more orders changed while updating payment method' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'orderIds', to_jsonb(target_order_ids),
    'paymentMethod', normalized_method,
    'ordersChanged', row_count_value,
    'paymentRowsChanged', changed_payment_rows
  );
end;
$$;

revoke all on function public.change_paid_order_payment_method_owner(text[], text) from public;
revoke all on function public.change_paid_order_payment_method_owner(text[], text) from anon;
grant execute on function public.change_paid_order_payment_method_owner(text[], text) to authenticated;

comment on function public.change_paid_order_payment_method_owner(text[], text) is
  'Owner-only correction of completed-order payment method; preserves items, totals, status, paid time, loyalty, and payment amounts.';
