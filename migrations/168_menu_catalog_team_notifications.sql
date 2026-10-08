-- Extend duplicate-safe Team menu notifications to new-product creation and
-- product archival. Historical delivery rows are preserved and never replayed.

begin;

alter table public.menu_item_unavailable_notification_deliveries
  drop constraint if exists menu_item_availability_delivery_event_check;

alter table public.menu_item_unavailable_notification_deliveries
  add constraint menu_item_availability_delivery_event_check
  check (availability_event in ('unavailable', 'available', 'created', 'archived'));

drop trigger if exists queue_menu_item_availability_team_delivery_trigger
  on public.menu_items;
drop trigger if exists queue_menu_item_team_delivery_trigger
  on public.menu_items;
drop function if exists public.queue_menu_item_availability_team_delivery();

create or replace function public.queue_menu_item_team_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_by uuid := auth.uid();
  changed_by_name text;
  russian_item_name text;
  event_name text;
begin
  -- Trusted maintenance/service writes have no staff identity to announce.
  if changed_by is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      return new;
    end if;
    event_name := 'created';
  elsif old.deleted_at is null and new.deleted_at is not null then
    event_name := 'archived';
  elsif old.deleted_at is not distinct from new.deleted_at
    and new.deleted_at is null
    and old.available is distinct from new.available then
    event_name := case when new.available is false then 'unavailable' else 'available' end;
  else
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
    event_name
  );

  return new;
end;
$$;

revoke all on function public.queue_menu_item_team_delivery()
  from public, anon, authenticated;

create trigger queue_menu_item_team_delivery_trigger
after insert or update of available, deleted_at on public.menu_items
for each row execute function public.queue_menu_item_team_delivery();

commit;

notify pgrst, 'reload schema';
