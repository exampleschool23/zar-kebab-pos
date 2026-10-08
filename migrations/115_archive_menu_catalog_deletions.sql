-- Removing a product or category must never erase context used by historical
-- orders and reports. The app archives rows; these triggers reject hard deletes.

begin;

alter table public.menu_categories
  add column if not exists deleted_at timestamptz;

create index if not exists idx_menu_categories_deleted_at
  on public.menu_categories(deleted_at);

create or replace function public.prevent_historical_menu_catalog_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Menu products and categories must be archived, not physically deleted'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_prevent_menu_item_hard_delete on public.menu_items;
create trigger trg_prevent_menu_item_hard_delete
  before delete on public.menu_items
  for each row execute function public.prevent_historical_menu_catalog_delete();

drop trigger if exists trg_prevent_menu_category_hard_delete on public.menu_categories;
create trigger trg_prevent_menu_category_hard_delete
  before delete on public.menu_categories
  for each row execute function public.prevent_historical_menu_catalog_delete();

commit;

notify pgrst, 'reload schema';
