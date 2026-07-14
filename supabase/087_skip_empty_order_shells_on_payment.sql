-- Empty unpaid order shells can coexist with a valid table order after an
-- interrupted waiter flow. Cancel those shells atomically before settling the
-- real table bill so they cannot block payment or keep the table occupied.

do $$
begin
  if to_regprocedure('public.settle_orders_payment_strict(jsonb)') is null then
    alter function public.settle_orders_payment(jsonb)
      rename to settle_orders_payment_strict;
  end if;
end $$;

create or replace function public.settle_orders_payment(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id text := nullif(btrim(payload->>'order_id'), '');
  target_table_id text := nullif(btrim(payload->>'table_id'), '');
begin
  if not public.current_staff_can_write('cashier') then
    raise exception 'Cashier write access is required' using errcode = '42501';
  end if;

  if (target_order_id is null) = (target_table_id is null) then
    raise exception 'Payment requires exactly one order or table' using errcode = '22023';
  end if;

  if target_table_id is not null then
    update public.orders o
       set status = 'cancelled',
           updated_at = now()
     where o.table_id = target_table_id
       and coalesce(o.payment_status, 'unpaid') <> 'paid'
       and o.paid_at is null
       and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
       and not exists (
         select 1
           from public.order_items oi
          where oi.order_id = o.id
            and coalesce(oi.status, '') <> 'cancelled'
            and greatest(coalesce(oi.quantity, 1), 1) > 0
            and coalesce(oi.unit_price, oi.price, 0) > 0
       );
  end if;

  return public.settle_orders_payment_strict(payload);
end;
$$;

revoke all on function public.settle_orders_payment(jsonb) from public;
grant execute on function public.settle_orders_payment(jsonb) to authenticated;

revoke all on function public.settle_orders_payment_strict(jsonb) from public;
revoke all on function public.settle_orders_payment_strict(jsonb) from authenticated;
