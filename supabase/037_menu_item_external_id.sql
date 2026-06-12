-- Add optional provider-facing menu item IDs for delivery apps and partners.
-- Internal POS ordering continues to use menu_items.id.

alter table public.menu_items
  add column if not exists external_id text not null default '';

create unique index if not exists idx_menu_items_external_id_unique
  on public.menu_items(external_id)
  where external_id <> '';
