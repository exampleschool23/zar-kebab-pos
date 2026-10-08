-- Older cashier quick-item rows can be missing their counter-item snapshot even
-- though the linked catalog item is still configured for cashier quick sales.
-- The cashier bill excludes those items from dine-in service, so repair the
-- targeted unpaid rows before the strict settlement function validates totals.

begin;

do $$
declare
  strict_definition text;
begin
  if to_regprocedure('public.settle_orders_payment_strict(jsonb)') is null then
    raise exception 'settle_orders_payment_strict(jsonb) is missing; apply migrations 083 and 087 first';
  end if;

  select pg_get_functiondef(to_regprocedure('public.settle_orders_payment_strict(jsonb)'))
    into strict_definition;

  if position('is_counter_item' in strict_definition) = 0
     or position('menu_subtotal' in strict_definition) = 0 then
    raise exception 'settle_orders_payment_strict(jsonb) does not contain counter-item service separation';
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

  -- Cashier quick products are catalogued separately from normal menu items.
  -- Current inserts save the counter flags directly, but older/fallback rows
  -- may not have them. Reconcile only the unpaid order(s) being settled so
  -- completed historical snapshots remain untouched.
  update public.order_items oi
     set item_type = 'counter',
         is_counter_item = true
    from public.orders o,
         public.menu_items mi
   where o.id = oi.order_id
     and mi.id = oi.menu_item_id
     and coalesce(mi.show_in_cashier_quick_items, false)
     and (
       (target_order_id is not null and o.id = target_order_id)
       or (target_order_id is null and o.table_id = target_table_id)
     )
     and coalesce(o.payment_status, 'unpaid') <> 'paid'
     and o.paid_at is null
     and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
     and (
       coalesce(oi.is_counter_item, false) = false
       or lower(coalesce(oi.item_type, '')) <> 'counter'
     );

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

notify pgrst, 'reload schema';

commit;
