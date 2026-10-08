-- Queue every available -> unavailable menu transition with immutable Russian
-- product and staff-name snapshots. The existing authenticated Telegram API
-- sends the queued event to the independently configured ZarKebab Team target.

begin;

create table if not exists public.menu_item_unavailable_notification_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  menu_item_id          text not null,
  menu_item_name        text not null,
  actor_id              uuid references public.profiles(id) on delete set null,
  actor_name            text not null,
  status                text not null default 'not_attempted'
                          check (status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id      text,
  telegram_message_id   text,
  error_message         text not null default 'Notification request has not started',
  attempted_at          timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_menu_item_unavailable_delivery_actor_item
  on public.menu_item_unavailable_notification_deliveries(
    actor_id,
    menu_item_id,
    created_at desc
  );

create index if not exists idx_menu_item_unavailable_delivery_status
  on public.menu_item_unavailable_notification_deliveries(
    status,
    attempted_at,
    created_at desc
  );

alter table public.menu_item_unavailable_notification_deliveries enable row level security;

drop policy if exists "menu_writers_read_unavailable_notification_deliveries"
  on public.menu_item_unavailable_notification_deliveries;
create policy "menu_writers_read_unavailable_notification_deliveries"
  on public.menu_item_unavailable_notification_deliveries for select
  to authenticated
  using (public.current_staff_can_write('menu'));

revoke all on table public.menu_item_unavailable_notification_deliveries
  from public, anon, authenticated;
grant select on table public.menu_item_unavailable_notification_deliveries
  to authenticated;

create or replace function public.queue_menu_item_unavailable_team_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_by uuid := auth.uid();
  changed_by_name text;
  russian_item_name text;
begin
  -- Trusted maintenance/service writes have no staff identity to announce.
  if changed_by is null then
    return new;
  end if;

  select coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    'Неизвестный сотрудник'
  )
  into changed_by_name
  from public.profiles as profile
  where profile.id = changed_by;

  russian_item_name := coalesce(
    nullif(btrim(new.name_ru), ''),
    nullif(btrim(new.name_uz), ''),
    nullif(btrim(new.name_en), ''),
    new.id,
    'Без названия'
  );

  insert into public.menu_item_unavailable_notification_deliveries (
    menu_item_id,
    menu_item_name,
    actor_id,
    actor_name
  ) values (
    new.id,
    russian_item_name,
    changed_by,
    coalesce(changed_by_name, 'Неизвестный сотрудник')
  );

  return new;
end;
$$;

revoke all on function public.queue_menu_item_unavailable_team_delivery()
  from public, anon, authenticated;

drop trigger if exists queue_menu_item_unavailable_team_delivery_trigger
  on public.menu_items;
create trigger queue_menu_item_unavailable_team_delivery_trigger
after update of available on public.menu_items
for each row
when (old.available is distinct from false and new.available is false)
execute function public.queue_menu_item_unavailable_team_delivery();

commit;

notify pgrst, 'reload schema';
