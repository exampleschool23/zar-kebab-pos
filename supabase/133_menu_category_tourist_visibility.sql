-- Let menu managers exclude selected categories only from Tourist-priced menus.
-- Regular waiter ordering and the standard public menu remain unchanged.

begin;

alter table public.menu_categories
  add column if not exists tourist_hidden boolean not null default false;

create index if not exists idx_menu_categories_tourist_visible
  on public.menu_categories(tourist_hidden, sort_order);

commit;

notify pgrst, 'reload schema';
