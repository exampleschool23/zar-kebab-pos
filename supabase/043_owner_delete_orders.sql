-- Owner-only operational order deletion.
-- Used for removing test orders before or after completion while keeping table state sane.

create or replace function public.delete_order_owner(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_trigger_exists boolean := false;
  v_reset_table boolean := false;
begin
  if not public.current_staff_has_role(array['owner']) then
    raise exception 'Only owner can delete orders' using errcode = '42501';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.order_items'::regclass
      and tgname = 'guard_paid_order_items'
      and not tgisinternal
  ) into v_trigger_exists;

  if v_trigger_exists then
    execute 'alter table public.order_items disable trigger guard_paid_order_items';
  end if;

  delete from public.order_item_cancellations
  where order_id = p_order_id;

  delete from public.orders
  where id = p_order_id;

  if v_trigger_exists then
    execute 'alter table public.order_items enable trigger guard_paid_order_items';
  end if;

  if v_order.table_id is not null then
    select not exists (
      select 1
      from public.orders o
      where o.table_id = v_order.table_id
        and coalesce(o.payment_status, 'unpaid') <> 'paid'
        and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
    ) into v_reset_table;

    if v_reset_table then
      update public.restaurant_tables
      set status = 'available',
          reserved_for_name = null,
          reserved_for_phone = null,
          reserved_at = null,
          reserved_until = null,
          reservation_notes = null,
          updated_at = now()
      where id = v_order.table_id
        and status in ('occupied', 'needs_bill', 'reserved');
    end if;
  end if;

  return jsonb_build_object(
    'deletedOrderId', p_order_id,
    'tableId', v_order.table_id,
    'resetTable', coalesce(v_reset_table, false)
  );
exception
  when others then
    if v_trigger_exists then
      execute 'alter table public.order_items enable trigger guard_paid_order_items';
    end if;
    raise;
end;
$$;

revoke all on function public.delete_order_owner(text) from public;
grant execute on function public.delete_order_owner(text) to authenticated;
grant execute on function public.delete_order_owner(text) to service_role;
