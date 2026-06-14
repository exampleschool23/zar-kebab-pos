-- Add delivery as a first-class sales/order type.

alter table public.orders
  drop constraint if exists orders_order_type_check;

alter table public.orders
  add constraint orders_order_type_check
  check (order_type in ('dine_in', 'take_away', 'delivery')) not valid;

alter table public.orders
  validate constraint orders_order_type_check;

alter table public.order_items
  drop constraint if exists order_items_order_type_check;

alter table public.order_items
  add constraint order_items_order_type_check
  check (order_type in ('dine_in', 'take_away', 'delivery')) not valid;

alter table public.order_items
  validate constraint order_items_order_type_check;
