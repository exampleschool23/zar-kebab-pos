-- Allow an owner to correct individual tender methods on a completed order.
-- Payment amounts and loyalty allocations remain immutable.

create or replace function public.change_paid_order_payment_methods_owner(
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  change_row jsonb;
  payment_id uuid;
  normalized_method text;
  payment_order_id text;
  current_method text;
  target_order_ids text[] := array[]::text[];
  seen_payment_ids uuid[] := array[]::uuid[];
  target_order_id text;
  target_table_id text;
  method_count integer;
  single_method text;
  summary_method text;
  changed_payment_rows integer := 0;
  row_count_value integer := 0;
begin
  if not public.current_staff_has_role(array['owner']) then
    raise exception 'Only owner can change a completed order payment method' using errcode = '42501';
  end if;

  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'At least one payment change is required' using errcode = '22023';
  end if;

  for change_row in select value from jsonb_array_elements(p_changes)
  loop
    payment_id := nullif(btrim(change_row->>'paymentId'), '')::uuid;
    normalized_method := lower(btrim(coalesce(change_row->>'method', '')));

    if payment_id is null then
      raise exception 'Every payment change requires a payment id' using errcode = '22023';
    end if;
    if payment_id = any(seen_payment_ids) then
      raise exception 'Payment % was included more than once', payment_id using errcode = '22023';
    end if;
    if normalized_method not in ('cash', 'card', 'terminal') then
      raise exception 'Unsupported payment method: %', normalized_method using errcode = '22023';
    end if;

    select op.order_id, op.method
      into payment_order_id, current_method
      from public.order_payments op
     where op.id = payment_id;

    if not found then
      raise exception 'Payment % not found', payment_id using errcode = 'P0002';
    end if;
    if current_method = 'loyalty_card' then
      raise exception 'Loyalty payment methods cannot be changed' using errcode = '22023';
    end if;

    seen_payment_ids := array_append(seen_payment_ids, payment_id);
    target_order_ids := array_append(target_order_ids, payment_order_id);
  end loop;

  select array_agg(distinct requested_id order by requested_id)
    into target_order_ids
    from unnest(target_order_ids) as requested(requested_id);

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

    perform 1
      from public.orders
     where id = target_order_id
       and (
         payment_status = 'paid'
         or status in ('paid', 'completed')
         or paid_at is not null
       )
     for update;

    if not found then
      raise exception 'Order % is not completed', target_order_id using errcode = '22023';
    end if;
  end loop;

  for change_row in select value from jsonb_array_elements(p_changes)
  loop
    payment_id := (change_row->>'paymentId')::uuid;
    normalized_method := lower(btrim(change_row->>'method'));

    update public.order_payments
       set method = normalized_method
     where id = payment_id
       and method <> 'loyalty_card'
       and method is distinct from normalized_method;
    get diagnostics row_count_value = row_count;
    changed_payment_rows := changed_payment_rows + row_count_value;
  end loop;

  foreach target_order_id in array target_order_ids
  loop
    select count(distinct method), min(method)
      into method_count, single_method
      from public.order_payments
     where order_id = target_order_id
       and method <> 'loyalty_card'
       and amount > 0;

    summary_method := case
      when method_count = 1 then single_method
      when method_count > 1 then 'mixed'
      else null
    end;

    if summary_method is not null then
      update public.orders
         set payment_method = summary_method
       where id = target_order_id
         and payment_method is distinct from summary_method;
      get diagnostics row_count_value = row_count;
    end if;
  end loop;

  return jsonb_build_object(
    'orderIds', to_jsonb(target_order_ids),
    'paymentsChanged', changed_payment_rows
  );
end;
$$;

revoke all on function public.change_paid_order_payment_methods_owner(jsonb) from public;
revoke all on function public.change_paid_order_payment_methods_owner(jsonb) from anon;
grant execute on function public.change_paid_order_payment_methods_owner(jsonb) to authenticated;

comment on function public.change_paid_order_payment_methods_owner(jsonb) is
  'Owner-only correction of individual completed-order payment methods; preserves payment amounts, items, totals, status, paid time, and loyalty.';
