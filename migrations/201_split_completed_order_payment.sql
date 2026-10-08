-- Narrow, audited exception to immutable tender amounts: split one payment,
-- preserving its total, original receipt time, and every other financial field.
begin;

create table public.paid_payment_split_receipts (
  request_id uuid primary key,
  order_id text not null,
  actor_id uuid not null,
  request jsonb not null,
  before_payments jsonb not null,
  after_payments jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.paid_payment_split_receipts enable row level security;
revoke all on public.paid_payment_split_receipts from public, anon, authenticated;

create function public.split_paid_order_payment(
  p_request_id uuid, p_order_id text, p_payment_id uuid,
  p_expected_amount integer, p_expected_method text,
  p_first_amount integer, p_first_method text, p_second_method text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_receipt public.paid_payment_split_receipts%rowtype;
  v_request jsonb;
  v_before jsonb;
  v_after jsonb;
  v_methods jsonb;
  v_summary text;
  v_actor_name text;
begin
  if auth.uid() is null or not public.current_staff_can_access('delete_paid_orders') then
    raise exception 'Delete completed orders access is required' using errcode = '42501';
  end if;
  if p_request_id is null or p_order_id is null then
    raise exception 'Request and order ids are required' using errcode = '22023';
  end if;
  v_request := jsonb_build_object('orderId', p_order_id, 'paymentId', p_payment_id,
    'expectedAmount', p_expected_amount, 'expectedMethod', p_expected_method,
    'firstAmount', p_first_amount, 'firstMethod', p_first_method, 'secondMethod', p_second_method);

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    case when v_order.table_id is not null then 'pos-table:' || v_order.table_id
    else 'pos-order:' || p_order_id end, 0));
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;

  -- Reconcile a lost response before considering any further mutation.
  select * into v_receipt from public.paid_payment_split_receipts where request_id = p_request_id;
  if found then
    if v_receipt.request <> v_request or v_receipt.actor_id <> auth.uid() then
      raise exception 'Request id already used' using errcode = '22023';
    end if;
  else
    if not (coalesce(v_order.payment_status = 'paid', false)
      or coalesce(v_order.status in ('paid', 'completed'), false) or v_order.paid_at is not null) then
      raise exception 'Order is not completed' using errcode = '22023';
    end if;
    if p_first_amount is null or p_expected_amount is null
      or p_first_amount <= 0 or p_first_amount >= p_expected_amount
      or p_first_method is null or p_first_method not in ('cash', 'card', 'terminal')
      or p_second_method is null or p_second_method not in ('cash', 'card', 'terminal') then
      raise exception 'Two positive payments with supported methods are required' using errcode = '22023';
    end if;
    perform 1 from public.order_payments where order_id = p_order_id for update;
    select coalesce(jsonb_agg(to_jsonb(op) order by created_at, id), '[]'::jsonb)
      into v_before from public.order_payments op where order_id = p_order_id;
    if p_payment_id is null then
      if jsonb_array_length(v_before) <> 0
        or v_order.total is distinct from p_expected_amount
        or v_order.payment_method is distinct from p_expected_method
        or p_expected_method is null or p_expected_method not in ('cash', 'card', 'terminal') then
        raise exception 'Payment changed. Refresh the order and try again.' using errcode = '40001';
      end if;
      v_methods := jsonb_build_array(jsonb_build_object('method', v_order.payment_method, 'amount', v_order.total));
      insert into public.order_payments(order_id, method, amount, created_by, created_at)
        values (p_order_id, p_first_method, p_first_amount, auth.uid(), coalesce(v_order.paid_at, now()));
    else
      select * into v_payment from public.order_payments where id = p_payment_id and order_id = p_order_id;
      if not found or v_payment.method = 'loyalty_card'
        or v_payment.amount is distinct from p_expected_amount
        or v_payment.method is distinct from p_expected_method then
        raise exception 'Payment changed or cannot be split. Refresh the order and try again.' using errcode = '40001';
      end if;
      v_methods := v_before;
      update public.order_payments set amount = p_first_amount, method = p_first_method where id = p_payment_id;
    end if;
    insert into public.order_payments(order_id, method, amount, created_by, created_at)
      values (p_order_id, p_second_method, p_expected_amount - p_first_amount,
        coalesce(v_payment.created_by, auth.uid()), coalesce(v_payment.created_at, v_order.paid_at, now()));

    select case when count(distinct method) > 1 then 'mixed' else min(method) end
      into v_summary from public.order_payments where order_id = p_order_id and method <> 'loyalty_card';
    update public.orders set payment_method = v_summary where id = p_order_id and payment_method is distinct from v_summary;
    select jsonb_agg(to_jsonb(op) order by created_at, id) into v_after
      from public.order_payments op where order_id = p_order_id;
    insert into public.paid_payment_split_receipts(request_id, order_id, actor_id, request, before_payments, after_payments)
      values(p_request_id, p_order_id, auth.uid(), v_request, v_before, v_after);

    select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
      into v_actor_name from public.profiles where id = auth.uid();
    -- Replace the method trigger's partial event with the complete allocation.
    insert into public.order_change_investor_notification_deliveries(
      event_type, order_id, transaction_id, order_number, table_name, total,
      old_payment_methods, new_payment_methods, actor_id, actor_name
    ) values ('payment_method_changed', p_order_id, txid_current(), v_order.order_number,
      coalesce(v_order.table_name, ''), coalesce(v_order.total, 0), v_methods, v_after, auth.uid(), coalesce(v_actor_name, 'Система'))
    on conflict (event_type, order_id, transaction_id) do update set
      old_payment_methods = excluded.old_payment_methods,
      new_payment_methods = excluded.new_payment_methods, updated_at = now();
  end if;

  select jsonb_agg(to_jsonb(op) order by created_at, id) into v_after
    from public.order_payments op where order_id = p_order_id;
  select payment_method into v_summary from public.orders where id = p_order_id;
  return jsonb_build_object('orderId', p_order_id, 'payments', v_after, 'payment_method', v_summary);
end;
$$;
revoke all on function public.split_paid_order_payment(uuid,text,uuid,integer,text,integer,text,text) from public, anon;
grant execute on function public.split_paid_order_payment(uuid,text,uuid,integer,text,integer,text,text) to authenticated;
commit;
notify pgrst, 'reload schema';
