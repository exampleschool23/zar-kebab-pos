-- Retire the standalone kitchen staff role.
-- Kitchen workflow remains available to owner/admin accounts.

update public.profiles
set role = 'waiter'
where role = 'kitchen';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'waiter', 'cashier', 'stakeholder', 'guest'));

drop policy if exists "staff_read_menu_categories" on public.menu_categories;
create policy "staff_read_menu_categories"
  on public.menu_categories for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','stakeholder']));

drop policy if exists "staff_read_menu_items" on public.menu_items;
create policy "staff_read_menu_items"
  on public.menu_items for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','stakeholder']));

drop policy if exists "staff_read_table_zones" on public.table_zones;
create policy "staff_read_table_zones"
  on public.table_zones for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','stakeholder']));

drop policy if exists "staff_read_restaurant_tables" on public.restaurant_tables;
create policy "staff_read_restaurant_tables"
  on public.restaurant_tables for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','stakeholder']));

drop policy if exists "staff_update_restaurant_table_status" on public.restaurant_tables;
create policy "staff_update_restaurant_table_status"
  on public.restaurant_tables for update
  to authenticated
  using (public.current_staff_has_role(array['waiter','cashier']))
  with check (public.current_staff_has_role(array['waiter','cashier']));

drop policy if exists "staff_read_business_settings" on public.business_settings;
create policy "staff_read_business_settings"
  on public.business_settings for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','stakeholder']));

drop policy if exists "Staff: read order item cancellations" on public.order_item_cancellations;
create policy "Staff: read order item cancellations"
  on public.order_item_cancellations for select
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','stakeholder']));

drop policy if exists "Kitchen: insert order item cancellations" on public.order_item_cancellations;
create policy "Kitchen: insert order item cancellations"
  on public.order_item_cancellations for insert
  with check (public.current_staff_has_role(array['owner','admin','waiter']));
