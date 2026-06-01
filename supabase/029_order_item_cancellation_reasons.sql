-- Preserve kitchen unavailable-item reasons even when the item row is removed
-- from the active bill.

create table if not exists public.order_item_cancellations (
  id bigserial primary key,
  order_id text references public.orders(id) on delete set null,
  order_item_id text,
  menu_item_id text references public.menu_items(id) on delete set null,
  reason text not null default 'Unavailable',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_item_cancellations_order
  on public.order_item_cancellations(order_id, created_at desc);

alter table public.order_item_cancellations enable row level security;

drop policy if exists "Staff: read order item cancellations" on public.order_item_cancellations;
create policy "Staff: read order item cancellations"
  on public.order_item_cancellations for select
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','kitchen','stakeholder']));

drop policy if exists "Kitchen: insert order item cancellations" on public.order_item_cancellations;
create policy "Kitchen: insert order item cancellations"
  on public.order_item_cancellations for insert
  with check (public.current_staff_has_role(array['owner','admin','kitchen']));
