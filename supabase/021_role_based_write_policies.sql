-- Tighten management writes by role while preserving operational table/order flow.
-- Run after 019_table_management.sql and 020_table_reservations.sql.

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role::text from public.profiles where id = auth.uid()),
    ''
  );
$$;

create or replace function public.current_staff_has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_staff_role() = any(roles);
$$;

grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.current_staff_has_role(text[]) to authenticated;

-- Replace broad menu writes with owner/admin-only management writes.
drop policy if exists "staff_all_categories" on public.menu_categories;
drop policy if exists "staff_all_menu_items" on public.menu_items;
drop policy if exists "staff_read_menu_categories" on public.menu_categories;
drop policy if exists "owner_admin_write_menu_categories" on public.menu_categories;
drop policy if exists "staff_read_menu_items" on public.menu_items;
drop policy if exists "owner_admin_write_menu_items" on public.menu_items;

create policy "staff_read_menu_categories"
  on public.menu_categories for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','kitchen','stakeholder']));

create policy "owner_admin_write_menu_categories"
  on public.menu_categories for all
  to authenticated
  using (public.current_staff_has_role(array['owner','admin']))
  with check (public.current_staff_has_role(array['owner','admin']));

create policy "staff_read_menu_items"
  on public.menu_items for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','kitchen','stakeholder']));

create policy "owner_admin_write_menu_items"
  on public.menu_items for all
  to authenticated
  using (public.current_staff_has_role(array['owner','admin']))
  with check (public.current_staff_has_role(array['owner','admin']));

-- Zones are management data, not waiter/kitchen data.
drop policy if exists "staff_all_table_zones" on public.table_zones;
drop policy if exists "staff_read_table_zones" on public.table_zones;
drop policy if exists "owner_admin_write_table_zones" on public.table_zones;

create policy "staff_read_table_zones"
  on public.table_zones for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','kitchen','stakeholder']));

create policy "owner_admin_write_table_zones"
  on public.table_zones for all
  to authenticated
  using (public.current_staff_has_role(array['owner','admin']))
  with check (public.current_staff_has_role(array['owner','admin']));

-- Tables need operational writes from waiter/cashier/kitchen, but metadata management
-- belongs to owner/admin. App-level permissions still hide edit/delete from staff.
drop policy if exists "staff_all_tables" on public.restaurant_tables;
drop policy if exists "staff_read_restaurant_tables" on public.restaurant_tables;
drop policy if exists "owner_admin_manage_restaurant_tables" on public.restaurant_tables;
drop policy if exists "staff_update_restaurant_table_status" on public.restaurant_tables;

create policy "staff_read_restaurant_tables"
  on public.restaurant_tables for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','kitchen','stakeholder']));

create policy "owner_admin_manage_restaurant_tables"
  on public.restaurant_tables for all
  to authenticated
  using (public.current_staff_has_role(array['owner','admin']))
  with check (public.current_staff_has_role(array['owner','admin']));

create policy "staff_update_restaurant_table_status"
  on public.restaurant_tables for update
  to authenticated
  using (public.current_staff_has_role(array['waiter','cashier','kitchen']))
  with check (public.current_staff_has_role(array['waiter','cashier','kitchen']));

-- Settings writes should stay owner/admin-only. Keep reads open to staff so service
-- rate and receipt behavior hydrate consistently across pages.
drop policy if exists "staff_read_business_settings" on public.business_settings;
drop policy if exists "owner_admin_manage_business_settings" on public.business_settings;

create policy "staff_read_business_settings"
  on public.business_settings for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','waiter','cashier','kitchen','stakeholder']));

create policy "owner_admin_manage_business_settings"
  on public.business_settings for all
  to authenticated
  using (public.current_staff_has_role(array['owner','admin']))
  with check (public.current_staff_has_role(array['owner','admin']));
