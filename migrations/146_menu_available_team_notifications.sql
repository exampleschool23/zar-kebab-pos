-- Extend the existing menu-availability delivery ledger to cover both
-- unavailable and available transitions. Historical rows remain unavailable
-- events and are never replayed.

begin;

alter table public.menu_item_unavailable_notification_deliveries
  add column if not exists availability_event text not null default 'unavailable';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.menu_item_unavailable_notification_deliveries'::regclass
      and conname = 'menu_item_availability_delivery_event_check'
  ) then
    alter table public.menu_item_unavailable_notification_deliveries
      add constraint menu_item_availability_delivery_event_check
      check (availability_event in ('unavailable', 'available'));
  end if;
end;
$$;

create index if not exists idx_menu_item_availability_delivery_actor_item
  on public.menu_item_unavailable_notification_deliveries(
    actor_id,
    menu_item_id,
    availability_event,
    created_at desc
  );

drop trigger if exists queue_menu_item_unavailable_team_delivery_trigger
  on public.menu_items;
drop trigger if exists queue_menu_item_availability_team_delivery_trigger
  on public.menu_items;
drop function if exists public.queue_menu_item_unavailable_team_delivery();

create or replace function public.queue_menu_item_availability_team_delivery()
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
  if changed_by is null or old.available is not distinct from new.available then
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
    actor_name,
    availability_event
  ) values (
    new.id,
    russian_item_name,
    changed_by,
    coalesce(changed_by_name, 'Неизвестный сотрудник'),
    case when new.available is false then 'unavailable' else 'available' end
  );

  return new;
end;
$$;

revoke all on function public.queue_menu_item_availability_team_delivery()
  from public, anon, authenticated;

create trigger queue_menu_item_availability_team_delivery_trigger
after update of available on public.menu_items
for each row
when (old.available is distinct from new.available)
execute function public.queue_menu_item_availability_team_delivery();

commit;

notify pgrst, 'reload schema';
