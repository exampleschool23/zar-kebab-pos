-- Counter/cashier quick items are paid order items, but they are not eligible
-- for loyalty discounts or dine-in service fee.
alter table public.order_items
  add column if not exists item_type text not null default 'menu',
  add column if not exists is_counter_item boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_item_type_check'
  ) then
    alter table public.order_items
      add constraint order_items_item_type_check
      check (item_type in ('menu', 'counter')) not valid;
  end if;
end $$;

create index if not exists idx_order_items_counter
  on public.order_items(is_counter_item, item_type);
