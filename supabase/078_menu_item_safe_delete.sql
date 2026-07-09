-- Soft-delete menu items so historical order reports keep menu context.
alter table public.menu_items
  add column if not exists deleted_at timestamptz;

create index if not exists idx_menu_items_deleted_at
  on public.menu_items(deleted_at);
