-- Keep bill item edits and their totals in one transaction. Deploy before the UI.
begin;

create table public.bill_item_edit_receipts (
  request_id uuid primary key,
  actor_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.bill_item_edit_receipts enable row level security;
revoke all on public.bill_item_edit_receipts from public, anon, authenticated;

create function public.update_bill_item_quantity(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set lock_timeout = '8s'
as $$
declare
  request_id_value uuid := (payload->>'request_id')::uuid;
  target_order_id text := nullif(payload->>'order_id', '');
  target_table_id text := nullif(payload->>'table_id', '');
  target_item_id uuid := (payload->>'order_item_id')::uuid;
  source_ids uuid[];
  order_row public.orders%rowtype;
  item_row public.order_items%rowtype;
  receipt public.bill_item_edit_receipts%rowtype;
  qty numeric := (payload->>'quantity')::numeric;
  menu_total numeric;
  counter_total numeric;
  service_rate numeric;
  service_value numeric;
  result_value jsonb;
begin
  if auth.uid() is null or not (
    coalesce(public.current_staff_can_write('cashier'), false) or coalesce(public.current_staff_can_write('tables'), false)
  ) then
    raise exception 'Bill edit permission required' using errcode = '42501';
  end if;
  if request_id_value is null or target_item_id is null
     or (target_order_id is null and target_table_id is null)
     or qty is null or qty < 0 or qty::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Invalid bill edit' using errcode = '22023';
  end if;

  -- A lost response may be retried after later edits or payment: never replay it.
  perform pg_advisory_xact_lock(hashtextextended('bill-edit:' || request_id_value, 0));
  select * into receipt from public.bill_item_edit_receipts where request_id = request_id_value;
  if found then
    if receipt.actor_id <> auth.uid() or receipt.request <> payload then
      raise exception 'Request id already used' using errcode = '22023';
    end if;
    return receipt.result;
  end if;

  select array_agg(distinct id) into source_ids from (
    select target_item_id as id
    union all
    select value::uuid from jsonb_array_elements_text(coalesce(payload->'source_item_ids', '[]'))
  ) ids;

  select o.* into order_row from public.orders o
    join public.order_items i on i.order_id = o.id
    where i.id = target_item_id
      and (target_order_id is null or o.id = target_order_id)
      and (target_table_id is null or o.table_id = target_table_id);
  if not found then
    raise exception 'Order item changed or unavailable. Refresh the bill.' using errcode = '40001';
  end if;

  -- Same lock order as kitchen submission and checkout: advisory lock, parent,
  -- then items. Totals are read only after all competing edits have committed.
  perform pg_advisory_xact_lock(hashtextextended(
    case when order_row.table_id is not null then 'pos-table:' || order_row.table_id
      else 'pos-order:' || order_row.id end, 0));
  select * into order_row from public.orders where id = order_row.id for update;
  if not found or coalesce(order_row.payment_status, '') in ('paid', 'cancelled')
     or order_row.paid_at is not null or coalesce(order_row.status, '') in ('paid', 'completed', 'cancelled') then
    raise exception 'Order is already closed or unavailable' using errcode = '23514';
  end if;
  if order_row.status = 'needs_bill' and not coalesce(public.current_staff_can_write('cashier'), false) then
    raise exception 'Bill is already with the cashier' using errcode = '42501';
  end if;
  select * into item_row from public.order_items
    where id = target_item_id and order_id = order_row.id for update;
  if not found or coalesce(item_row.status, '') = 'cancelled' then
    raise exception 'Order item changed or unavailable. Refresh the bill.' using errcode = '40001';
  end if;
  -- Never allow supplied group IDs to delete items belonging to another bill.
  if exists (select 1 from public.order_items where id = any(source_ids) and order_id <> order_row.id) then
    raise exception 'Item group spans different orders. Refresh the bill.' using errcode = '22023';
  end if;

  qty := case when qty = 0 then 0 when item_row.sale_unit = 'kg' then round(qty, 3)
    else greatest(1, round(qty)) end;
  if qty = 0 then
    delete from public.order_items where order_id = order_row.id and id = any(source_ids);
  else
    update public.order_items set quantity = qty where id = target_item_id;
    delete from public.order_items where order_id = order_row.id and id = any(source_ids) and id <> target_item_id;
  end if;

  select
    coalesce(sum(coalesce(unit_price, price, 0) * quantity) filter (where not (
      coalesce(is_counter_item, false) or lower(coalesce(item_type, '')) in ('counter', 'quick', 'cashier_quick'))), 0),
    coalesce(sum(coalesce(unit_price, price, 0) * quantity) filter (where
      coalesce(is_counter_item, false) or lower(coalesce(item_type, '')) in ('counter', 'quick', 'cashier_quick')), 0)
    into menu_total, counter_total from public.order_items
    where order_id = order_row.id and coalesce(status, '') <> 'cancelled';
  service_rate := case when order_row.order_type in ('take_away', 'delivery', 'game_club') then 0
    else greatest(0, least(100, coalesce(order_row.service_rate_pct, 20))) end;
  service_value := round(menu_total * service_rate / 100);
  -- Unpaid quantity edits preserve prices and the saved service rate. Loyalty is
  -- applied at checkout, as in the previous getOrderPaymentFields edit path.
  update public.orders set subtotal = round(menu_total + counter_total),
    service_fee = service_value, service_rate_pct = service_rate,
    total = round(menu_total + counter_total + service_value), updated_at = now()
    where id = order_row.id;

  if order_row.table_id is not null and not exists (
    select 1 from public.orders o join public.order_items i on i.order_id = o.id
    where o.table_id = order_row.table_id and coalesce(o.payment_status, '') not in ('paid', 'cancelled')
      and o.paid_at is null and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
      and coalesce(i.status, '') <> 'cancelled'
  ) then
    update public.restaurant_tables set status = 'available', updated_at = now()
      where id = order_row.table_id and status <> 'reserved';
  end if;
  result_value := jsonb_build_object('order_id', order_row.id, 'total', round(menu_total + counter_total + service_value));
  insert into public.bill_item_edit_receipts(request_id, actor_id, request, result)
    values (request_id_value, auth.uid(), payload, result_value);
  return result_value;
end;
$$;
revoke all on function public.update_bill_item_quantity(jsonb) from public, anon;
grant execute on function public.update_bill_item_quantity(jsonb) to authenticated;
commit;
notify pgrst, 'reload schema';
