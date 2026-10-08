-- Keep status-message identities after order removal; service-only ledger.
begin;
set local lock_timeout = '5s';
create table public.order_status_telegram_messages (
  id uuid primary key,
  order_ids text[] not null check (cardinality(order_ids) > 0),
  chat_id text not null,
  message_id text,
  delete_requested boolean not null default false,
  deleted_at timestamptz,
  attempted_at timestamptz,
  error_message text not null default '',
  created_at timestamptz not null default now()
);
alter table public.order_status_telegram_messages enable row level security;
revoke all on public.order_status_telegram_messages from public, anon, authenticated;
grant all on public.order_status_telegram_messages to service_role;
create index order_status_message_orders on public.order_status_telegram_messages using gin(order_ids);
create index order_status_message_cleanup on public.order_status_telegram_messages(attempted_at)
  where delete_requested and deleted_at is null and message_id is not null;

create function public.reserve_order_status_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare order_id text;
begin
  -- Lock in a stable order to serialize reservation with order deletion.
  for order_id in select distinct unnest(new.order_ids) order by 1 loop
    perform 1 from public.orders where id = order_id for key share;
    if not found then new.delete_requested := true; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.reserve_order_status_message() from public, anon, authenticated;
create trigger reserve_order_status_message before insert on public.order_status_telegram_messages
  for each row execute function public.reserve_order_status_message();

create function public.queue_deleted_order_status_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.order_status_telegram_messages set delete_requested = true
    where order_ids @> array[old.id] and deleted_at is null;
  return old;
end;
$$;
revoke all on function public.queue_deleted_order_status_messages() from public, anon, authenticated;
create trigger queue_deleted_order_status_messages after delete on public.orders
  for each row execute function public.queue_deleted_order_status_messages();

create or replace function public.invoke_order_status_cleanup()
returns bigint language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  if not exists (select 1 from public.order_status_telegram_messages where delete_requested and deleted_at is null and message_id is not null) then
    return null;
  end if;
  select decrypted_secret into cron_secret from vault.decrypted_secrets
    where name = 'zar_kebab_daily_report_cron_secret' order by created_at desc limit 1;
  if nullif(btrim(cron_secret), '') is null then return null; end if;
  select net.http_get(
    url := 'https://www.zarkebab.uz/api/telegram/daily-salary?task=order-status-cleanup',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.invoke_order_status_cleanup() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('zar-kebab-order-status-cleanup', '* * * * *',
    'select public.invoke_order_status_cleanup();');
end $$;
commit;
