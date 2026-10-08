-- Manage Menu staff may edit catalog rows, but only owners may change the
-- archive boundary. Keep ordinary admin edits and trusted service work intact.

begin;

create or replace function public.enforce_owner_only_menu_catalog_archival()
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
    if new.deleted_at is not null and not public.is_owner() then
      raise exception 'Only the owner can create an archived menu product or category'
        using errcode = '42501';
    end if;
  elsif old.deleted_at is distinct from new.deleted_at and not public.is_owner() then
    raise exception 'Only the owner can archive or restore menu products and categories'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_owner_only_menu_catalog_archival()
  from public, anon, authenticated;

drop trigger if exists trg_owner_only_menu_item_archival_insert
  on public.menu_items;
create trigger trg_owner_only_menu_item_archival_insert
  before insert on public.menu_items
  for each row
  when (new.deleted_at is not null)
  execute function public.enforce_owner_only_menu_catalog_archival();

drop trigger if exists trg_owner_only_menu_item_archival_update
  on public.menu_items;
create trigger trg_owner_only_menu_item_archival_update
  before update of deleted_at on public.menu_items
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.enforce_owner_only_menu_catalog_archival();

drop trigger if exists trg_owner_only_menu_category_archival_insert
  on public.menu_categories;
create trigger trg_owner_only_menu_category_archival_insert
  before insert on public.menu_categories
  for each row
  when (new.deleted_at is not null)
  execute function public.enforce_owner_only_menu_catalog_archival();

drop trigger if exists trg_owner_only_menu_category_archival_update
  on public.menu_categories;
create trigger trg_owner_only_menu_category_archival_update
  before update of deleted_at on public.menu_categories
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.enforce_owner_only_menu_catalog_archival();

commit;

notify pgrst, 'reload schema';
