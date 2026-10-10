-- Any staff member with Manage Menu write access may archive or restore menu
-- products and categories. Archival stays a deleted_at boundary; physical
-- deletion of referenced catalog rows remains rejected by migration 115.

begin;

drop trigger if exists trg_owner_only_menu_item_archival_insert on public.menu_items;
drop trigger if exists trg_owner_only_menu_item_archival_update on public.menu_items;
drop trigger if exists trg_owner_only_menu_category_archival_insert on public.menu_categories;
drop trigger if exists trg_owner_only_menu_category_archival_update on public.menu_categories;
drop function if exists public.enforce_owner_only_menu_catalog_archival();

create or replace function public.enforce_menu_catalog_archival_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted SQL, migration, and service-role sessions have no authenticated
  -- user and must remain able to maintain or recover catalog rows.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.deleted_at is not null and not public.current_staff_can_write('menu') then
      raise exception 'Manage Menu access is required to create an archived menu product or category'
        using errcode = '42501';
    end if;
  elsif old.deleted_at is distinct from new.deleted_at and not public.current_staff_can_write('menu') then
    raise exception 'Manage Menu access is required to archive or restore menu products and categories'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_menu_catalog_archival_access()
  from public, anon, authenticated;

create trigger trg_menu_item_archival_access_insert
  before insert on public.menu_items
  for each row
  when (new.deleted_at is not null)
  execute function public.enforce_menu_catalog_archival_access();

create trigger trg_menu_item_archival_access_update
  before update of deleted_at on public.menu_items
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.enforce_menu_catalog_archival_access();

create trigger trg_menu_category_archival_access_insert
  before insert on public.menu_categories
  for each row
  when (new.deleted_at is not null)
  execute function public.enforce_menu_catalog_archival_access();

create trigger trg_menu_category_archival_access_update
  before update of deleted_at on public.menu_categories
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.enforce_menu_catalog_archival_access();

commit;

notify pgrst, 'reload schema';
