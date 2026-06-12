-- Add provider-facing menu item IDs for delivery apps and partners.
-- Internal POS ordering continues to use menu_items.id.

create or replace function public.generate_menu_item_external_id()
returns text
language sql
as $$
  select 'MI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

alter table public.menu_items
  add column if not exists external_id text not null default public.generate_menu_item_external_id();

create unique index if not exists idx_menu_items_external_id_unique
  on public.menu_items(external_id)
  where external_id <> '';
