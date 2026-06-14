-- Real take-away orders are order rows without a table, not fake tables.
alter table public.orders
  add column if not exists order_type text not null default 'dine_in',
  add column if not exists order_number text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_order_type_check'
  ) then
    alter table public.orders
      add constraint orders_order_type_check
      check (order_type in ('dine_in', 'take_away', 'delivery')) not valid;
  end if;
end $$;

update public.orders
set order_type = 'dine_in'
where order_type is null;

create index if not exists idx_orders_order_type
  on public.orders(order_type);

create index if not exists idx_orders_order_number
  on public.orders(order_number);
