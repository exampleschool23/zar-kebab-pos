-- One immutable Team notification per newly committed Game Club kitchen round.
-- Uses the existing Vault CRON_SECRET configured by migration 152.
begin;
set local lock_timeout = '5s';

create table if not exists public.game_club_team_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  kitchen_round_id text not null,
  snapshot jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent')),
  chat_id text,
  telegram_message_ids jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, kitchen_round_id)
);
alter table public.game_club_team_notifications enable row level security;
revoke all on public.game_club_team_notifications from public, anon, authenticated;
grant all on public.game_club_team_notifications to service_role;
create index if not exists game_club_team_notifications_queued
  on public.game_club_team_notifications(created_at) where status = 'queued';

create or replace function public.invoke_game_club_team_notifications()
returns bigint language plpgsql security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  if not exists (select 1 from public.game_club_team_notifications where status = 'queued') then
    return null;
  end if;
  select decrypted_secret into cron_secret from vault.decrypted_secrets
    where name = 'zar_kebab_daily_report_cron_secret' order by created_at desc limit 1;
  if nullif(btrim(cron_secret), '') is null then return null; end if;
  select net.http_get(
    url := 'https://www.zarkebab.uz/api/telegram/daily-salary?task=game-club-orders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.invoke_game_club_team_notifications() from public, anon, authenticated;

create or replace function public.queue_game_club_team_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  saved_order public.orders%rowtype;
  saved_round public.order_kitchen_rounds%rowtype;
  actor_name text;
  submitted_items jsonb;
  submitted_total numeric;
begin
  select * into saved_order from public.orders where id = new.order_id;
  if saved_order.order_type is distinct from 'game_club' then return new; end if;
  -- Deferred until commit: the receipt's first insert may contain only one item.
  select * into saved_round from public.order_kitchen_rounds
    where order_id = new.order_id and kitchen_round_id = new.kitchen_round_id;
  select coalesce(nullif(btrim(full_name), ''), 'Неизвестный сотрудник') into actor_name
    from public.profiles where id = auth.uid();
  select jsonb_agg(jsonb_build_object(
      'name', item.name,
      'menu_name_ru', coalesce(menu.name_ru, item.name),
      'quantity', item.quantity, 'sale_unit', item.sale_unit,
      'price', item.price, 'unit_price', item.unit_price,
      'selected_options', item.selected_options, 'notes', item.notes
    ) order by item.created_at, item.id),
    sum(coalesce(item.unit_price, item.price, 0) * item.quantity)
    into submitted_items, submitted_total
    from public.order_items item left join public.menu_items menu on menu.id = item.menu_item_id
    where item.order_id = new.order_id and item.id = any(saved_round.item_ids)
      and coalesce(item.status, '') <> 'cancelled';
  if submitted_items is null then return new; end if;
  insert into public.game_club_team_notifications(order_id, kitchen_round_id, snapshot)
    values(new.order_id, new.kitchen_round_id, jsonb_build_object(
      'actor_name', coalesce(actor_name, 'Неизвестный сотрудник'),
      'submitted_at', saved_round.submitted_at, 'price_mode', saved_order.price_mode,
      'items', submitted_items, 'total', submitted_total
    )) on conflict (order_id, kitchen_round_id) do nothing;
  -- Dispatch failures never roll back an accepted order; the minute job retries.
  begin
    perform public.invoke_game_club_team_notifications();
  exception when others then
    raise warning 'Game Club notification queued; immediate dispatch failed';
  end;
  return new;
end;
$$;
revoke all on function public.queue_game_club_team_notification() from public, anon, authenticated;
drop trigger if exists queue_game_club_team_notification on public.order_kitchen_rounds;
create constraint trigger queue_game_club_team_notification
  after insert on public.order_kitchen_rounds deferrable initially deferred
  for each row execute function public.queue_game_club_team_notification();

-- No historical backfill. Reapplying the migration preserves sent receipts.
do $$
declare existing_id bigint;
begin
  for existing_id in select jobid from cron.job where jobname = 'zar-kebab-game-club-team' loop
    perform cron.unschedule(existing_id);
  end loop;
  perform cron.schedule('zar-kebab-game-club-team', '* * * * *',
    'select public.invoke_game_club_team_notifications();');
end $$;
commit;
