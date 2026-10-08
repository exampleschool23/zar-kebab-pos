-- Immutable Investor alerts for real changes to explicitly managed ingredients.
begin;
set local lock_timeout = '5s';
create table if not exists public.ingredient_investor_notifications (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  event_type text not null check (event_type in ('created', 'updated', 'archived', 'restored')),
  snapshot jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent')),
  chat_id text,
  telegram_message_ids jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ingredient_investor_notifications enable row level security;
revoke all on public.ingredient_investor_notifications from public, anon, authenticated;
grant all on public.ingredient_investor_notifications to service_role;
create index if not exists ingredient_investor_notifications_queued
  on public.ingredient_investor_notifications(created_at) where status = 'queued';

create or replace function public.invoke_ingredient_investor_notifications()
returns bigint language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  if not exists (select 1 from public.ingredient_investor_notifications where status = 'queued') then
    return null;
  end if;
  select decrypted_secret into cron_secret from vault.decrypted_secrets
    where name = 'zar_kebab_daily_report_cron_secret' order by created_at desc limit 1;
  if nullif(btrim(cron_secret), '') is null then return null; end if;
  select net.http_get(
    url := 'https://www.zarkebab.uz/api/telegram/daily-salary?task=ingredient-events',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.invoke_ingredient_investor_notifications() from public, anon, authenticated;

create or replace function public.queue_ingredient_investor_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  event_kind text;
  actor_name text;
  before_value jsonb;
  after_value jsonb;
begin
  -- No historical broadcasts, imported suggestions, or service/migration events.
  if auth.uid() is null or new.is_catalog_managed is not true then return new; end if;
  after_value := jsonb_build_object('name', new.product_name, 'category', new.category,
    'unit', new.unit, 'normal_unit_price', new.normal_unit_price, 'is_active', new.is_active);
  if tg_op = 'INSERT' then
    event_kind := 'created';
  elsif old.is_catalog_managed is not true then
    event_kind := 'created';
  else
    before_value := jsonb_build_object('name', old.product_name, 'category', old.category,
      'unit', old.unit, 'normal_unit_price', old.normal_unit_price, 'is_active', old.is_active);
    -- Retries, unchanged saves, and purchase metadata updates stay silent.
    if before_value = after_value then return new; end if;
    event_kind := case when old.is_active is distinct from new.is_active
      then case when new.is_active then 'restored' else 'archived' end else 'updated' end;
  end if;
  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
    into actor_name from public.profiles where id = auth.uid();
  insert into public.ingredient_investor_notifications(product_key, event_type, snapshot)
  values(new.product_key, event_kind, jsonb_build_object(
    'event_type', event_kind, 'before', before_value, 'after', after_value,
    'actor_name', coalesce(actor_name, 'Система'), 'changed_at', now()
  ));
  begin
    perform public.invoke_ingredient_investor_notifications();
  exception when others then
    raise warning 'Ingredient notification queued; immediate dispatch failed';
  end;
  return new;
end;
$$;
revoke all on function public.queue_ingredient_investor_notification() from public, anon, authenticated;
drop trigger if exists queue_ingredient_investor_notification on public.bazaar_product_catalog;
create trigger queue_ingredient_investor_notification
  after insert or update on public.bazaar_product_catalog
  for each row execute function public.queue_ingredient_investor_notification();

-- No historical backfill. Reapplying the migration preserves sent receipts.
do $$
declare existing_id bigint;
begin
  for existing_id in select jobid from cron.job where jobname = 'zar-kebab-ingredient-investor' loop
    perform cron.unschedule(existing_id);
  end loop;
  perform cron.schedule('zar-kebab-ingredient-investor', '* * * * *',
    'select public.invoke_ingredient_investor_notifications();');
end $$;
commit;
