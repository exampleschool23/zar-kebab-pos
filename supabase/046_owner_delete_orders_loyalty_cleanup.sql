-- Ensure owner order deletion removes all order-linked loyalty side effects too.
-- Apply after 043_owner_delete_orders.sql.

create or replace function public.delete_order_owner(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_tx public.loyalty_transactions%rowtype;
  v_card_id uuid;
  v_card_ids uuid[] := array[]::uuid[];
  v_start_balances integer[] := array[]::integer[];
  v_index integer := 0;
  v_trigger_exists boolean := false;
  v_reset_table boolean := false;
  v_start_balance integer := 0;
  v_balance integer := 0;
  v_before integer := 0;
  v_after integer := 0;
  v_delta integer := 0;
  v_total_earned integer := 0;
  v_total_redeemed integer := 0;
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

  for v_card_id, v_start_balance in
    select distinct on (loyalty_card_id)
      loyalty_card_id,
      coalesce(balance_before, 0)
    from public.loyalty_transactions
    where loyalty_card_id in (
      select distinct loyalty_card_id
      from public.loyalty_transactions
      where order_id = p_order_id
    )
    order by loyalty_card_id, created_at asc, id asc
  loop
    v_card_ids := array_append(v_card_ids, v_card_id);
    v_start_balances := array_append(v_start_balances, v_start_balance);
  end loop;

  delete from public.loyalty_transactions
  where order_id = p_order_id;

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

  if coalesce(array_length(v_card_ids, 1), 0) > 0 then
    for v_index in 1..array_length(v_card_ids, 1) loop
      v_card_id := v_card_ids[v_index];
      v_start_balance := v_start_balances[v_index];

      perform 1
      from public.loyalty_cards
      where id = v_card_id
      for update;

      v_balance := coalesce(v_start_balance, 0);
      v_total_earned := v_balance;
      v_total_redeemed := 0;

      for v_tx in
        select *
        from public.loyalty_transactions
        where loyalty_card_id = v_card_id
        order by created_at asc, id asc
      loop
        if v_tx.balance_before is not null and v_tx.balance_after is not null then
          v_delta := v_tx.balance_after - v_tx.balance_before;
        elsif v_tx.type = 'redeemed' then
          v_delta := -abs(v_tx.amount);
        else
          v_delta := v_tx.amount;
        end if;

        v_before := v_balance;
        v_after := v_before + v_delta;
        if v_after < 0 then
          raise exception 'Deleting this order would make loyalty balance negative' using errcode = '23514';
        end if;

        update public.loyalty_transactions
        set balance_before = v_before,
            balance_after = v_after
        where id = v_tx.id;

        v_balance := v_after;
        if v_delta > 0 then
          v_total_earned := v_total_earned + v_delta;
        elsif v_delta < 0 then
          v_total_redeemed := v_total_redeemed + abs(v_delta);
        end if;
      end loop;

      update public.loyalty_cards
      set balance = v_balance,
          total_earned = v_total_earned,
          total_redeemed = v_total_redeemed,
          updated_at = now()
      where id = v_card_id;
    end loop;
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
