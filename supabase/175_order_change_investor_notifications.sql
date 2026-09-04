-- Queue immutable, duplicate-safe Investor notifications whenever an order is
-- deleted or a completed-order tender method is corrected.

begin;

create table if not exists public.order_change_investor_notification_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  event_type            text not null check (event_type in ('order_deleted', 'payment_method_changed')),
  order_id              text not null,
  transaction_id        bigint not null,
  order_number          text,
  table_name            text not null default '',
  total                 bigint not null default 0,
  old_payment_methods   jsonb not null default '[]'::jsonb,
  new_payment_methods   jsonb not null default '[]'::jsonb,
  actor_id              uuid references public.profiles(id) on delete set null,
  actor_name            text not null,
  target_key            text not null default 'salary_events',
  status                text not null default 'not_attempted'
                        check (status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id      text,
  telegram_message_id   text,
  error_message         text not null default 'Notification request has not started',
  attempted_at          timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (event_type, order_id, transaction_id)
);

alter table public.order_change_investor_notification_deliveries enable row level security;
revoke all on table public.order_change_investor_notification_deliveries from public, anon, authenticated;

create index if not exists idx_order_change_investor_delivery_status
  on public.order_change_investor_notification_deliveries(status, attempted_at, created_at desc);

create or replace function public.queue_order_change_investor_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_actor_name text;
  v_old_methods jsonb := '[]'::jsonb;
  v_new_methods jsonb := '[]'::jsonb;
  v_event_type text;
begin
  if tg_table_name = 'orders' and tg_op = 'DELETE' then
    v_order := old;
    v_event_type := 'order_deleted';
    select coalesce(jsonb_agg(jsonb_build_object('method', method, 'amount', amount) order by created_at, id), '[]'::jsonb)
      into v_old_methods from public.order_payments where order_id = old.id;
  elsif tg_table_name = 'orders' and tg_op = 'UPDATE'
        and old.payment_method is distinct from new.payment_method
        and not exists (select 1 from public.order_payments where order_id = new.id and method <> 'loyalty_card') then
    v_order := new;
    v_event_type := 'payment_method_changed';
    v_old_methods := jsonb_build_array(jsonb_build_object('method', old.payment_method, 'amount', old.total));
    v_new_methods := jsonb_build_array(jsonb_build_object('method', new.payment_method, 'amount', new.total));
  elsif tg_table_name = 'order_payments' and tg_op = 'UPDATE' and old.method is distinct from new.method then
    select * into v_order from public.orders where id = new.order_id;
    if not found then return new; end if;
    v_event_type := 'payment_method_changed';
    v_old_methods := jsonb_build_array(jsonb_build_object('paymentId', old.id, 'method', old.method, 'amount', old.amount));
    v_new_methods := jsonb_build_array(jsonb_build_object('paymentId', new.id, 'method', new.method, 'amount', new.amount));
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
    into v_actor_name from public.profiles where id = auth.uid();

  insert into public.order_change_investor_notification_deliveries (
    event_type, order_id, transaction_id, order_number, table_name, total,
    old_payment_methods, new_payment_methods, actor_id, actor_name
  ) values (
    v_event_type, v_order.id, txid_current(), v_order.order_number, coalesce(v_order.table_name, ''),
    coalesce(v_order.total, 0), v_old_methods, v_new_methods, auth.uid(), coalesce(v_actor_name, 'Система')
  )
  on conflict (event_type, order_id, transaction_id) do update set
    old_payment_methods = case
      when excluded.event_type = 'payment_method_changed'
      then order_change_investor_notification_deliveries.old_payment_methods || excluded.old_payment_methods
      else order_change_investor_notification_deliveries.old_payment_methods
    end,
    new_payment_methods = case
      when excluded.event_type = 'payment_method_changed'
      then order_change_investor_notification_deliveries.new_payment_methods || excluded.new_payment_methods
      else order_change_investor_notification_deliveries.new_payment_methods
    end,
    updated_at = now();

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.queue_order_change_investor_notification() from public, anon, authenticated;

drop trigger if exists queue_order_deletion_investor_notification on public.orders;
create trigger queue_order_deletion_investor_notification
before delete on public.orders for each row
execute function public.queue_order_change_investor_notification();

drop trigger if exists queue_legacy_order_payment_change_investor_notification on public.orders;
create trigger queue_legacy_order_payment_change_investor_notification
after update of payment_method on public.orders for each row
when (old.payment_method is distinct from new.payment_method)
execute function public.queue_order_change_investor_notification();

drop trigger if exists queue_order_payment_change_investor_notification on public.order_payments;
create trigger queue_order_payment_change_investor_notification
after update of method on public.order_payments for each row
when (old.method is distinct from new.method)
execute function public.queue_order_change_investor_notification();

commit;

notify pgrst, 'reload schema';
