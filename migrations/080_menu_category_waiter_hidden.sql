-- Hide whole categories from waiter table ordering without affecting public menu,
-- order history, accounting, or analytics.
alter table public.menu_categories
  add column if not exists waiter_hidden boolean not null default false;

create index if not exists idx_menu_categories_waiter_visible
  on public.menu_categories(waiter_hidden, sort_order);

notify pgrst, 'reload schema';
