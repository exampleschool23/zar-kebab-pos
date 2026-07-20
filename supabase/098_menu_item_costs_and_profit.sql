-- Private menu-item costs and immutable per-sale cost snapshots.
-- Cost values are readable only by staff who can manage the menu or view the
-- dashboard. Public, Telegram-menu, waiter, and cashier catalog reads continue
-- to use menu_items and never receive these values.

create table if not exists public.menu_item_costs (
  menu_item_id text primary key references public.menu_items(id) on delete cascade,
  cost_price integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint menu_item_costs_cost_price_nonnegative check (cost_price >= 0)
);

alter table public.order_items
  add column if not exists cost_price integer;

alter table public.order_items
  drop constraint if exists order_items_cost_price_nonnegative;

alter table public.order_items
  add constraint order_items_cost_price_nonnegative
  check (cost_price is null or cost_price >= 0) not valid;

alter table public.menu_item_costs enable row level security;

revoke all on public.menu_item_costs from anon;
grant select, insert, update, delete on public.menu_item_costs to authenticated;

drop policy if exists "feature_access_read_menu_item_costs" on public.menu_item_costs;
create policy "feature_access_read_menu_item_costs"
  on public.menu_item_costs for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','menu']));

drop policy if exists "feature_access_insert_menu_item_costs" on public.menu_item_costs;
create policy "feature_access_insert_menu_item_costs"
  on public.menu_item_costs for insert
  to authenticated
  with check (public.current_staff_can_write('menu'));

drop policy if exists "feature_access_update_menu_item_costs" on public.menu_item_costs;
create policy "feature_access_update_menu_item_costs"
  on public.menu_item_costs for update
  to authenticated
  using (public.current_staff_can_write('menu'))
  with check (public.current_staff_can_write('menu'));

drop policy if exists "feature_access_delete_menu_item_costs" on public.menu_item_costs;
create policy "feature_access_delete_menu_item_costs"
  on public.menu_item_costs for delete
  to authenticated
  using (public.current_staff_can_write('menu'));

create or replace function public.snapshot_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never trust a client-provided cost. Missing legacy costs stay null so
  -- reporting can fall back to the current protected menu cost.
  new.cost_price := (
    select item_cost.cost_price
    from public.menu_item_costs as item_cost
    where item_cost.menu_item_id = new.menu_item_id
  );
  return new;
end;
$$;

revoke all on function public.snapshot_order_item_cost() from public;

drop trigger if exists trg_snapshot_order_item_cost on public.order_items;
create trigger trg_snapshot_order_item_cost
  before insert on public.order_items
  for each row
  execute function public.snapshot_order_item_cost();

notify pgrst, 'reload schema';
