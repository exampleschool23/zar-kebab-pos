-- Store whether each kitchen item should be served in-house or packed.
alter table public.order_items
  add column if not exists order_type text not null default 'dine_in';

alter table public.order_items
  drop constraint if exists order_items_order_type_check;

alter table public.order_items
  add constraint order_items_order_type_check
  check (order_type in ('dine_in', 'take_away'));

create index if not exists idx_order_items_order_type
  on public.order_items(order_type);
