-- Add manual shelf stock count for menu items.

alter table public.menu_items
  add column if not exists stock_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_stock_count_nonnegative'
  ) then
    alter table public.menu_items
      add constraint menu_items_stock_count_nonnegative check (stock_count >= 0) not valid;
  end if;
end $$;

alter table public.menu_items
  validate constraint menu_items_stock_count_nonnegative;

