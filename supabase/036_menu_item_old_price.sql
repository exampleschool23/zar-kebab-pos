-- Add optional original price for visible menu discounts.
-- The current payable price stays in menu_items.price; old_price is display-only.

alter table public.menu_items
  add column if not exists old_price integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_old_price_nonnegative'
  ) then
    alter table public.menu_items
      add constraint menu_items_old_price_nonnegative check (old_price >= 0) not valid;
  end if;
end $$;
