-- Make explicit per-user feature access effective at the database policy layer.
-- The frontend already routes by profiles.feature_access; these policies keep
-- RLS aligned for users whose role is "guest" but who have staff permissions.

create or replace function public.current_staff_can_access_any(feature_keys text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from unnest(feature_keys) as requested(feature_key)
    where public.current_staff_can_access(requested.feature_key)
  );
$$;

grant execute on function public.current_staff_can_access_any(text[]) to authenticated;

-- Menu catalog is required by waiter, cashier, reports, dashboard, and menu admin.
drop policy if exists "staff_all_categories" on public.menu_categories;
drop policy if exists "staff_read_menu_categories" on public.menu_categories;
drop policy if exists "feature_access_read_menu_categories" on public.menu_categories;
create policy "feature_access_read_menu_categories"
  on public.menu_categories for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','menu','cashier','reports','settings']));

drop policy if exists "owner_admin_write_menu_categories" on public.menu_categories;
drop policy if exists "feature_access_write_menu_categories" on public.menu_categories;
create policy "feature_access_write_menu_categories"
  on public.menu_categories for all
  to authenticated
  using (public.current_staff_can_access('menu'))
  with check (public.current_staff_can_access('menu'));

drop policy if exists "staff_all_menu_items" on public.menu_items;
drop policy if exists "staff_read_menu_items" on public.menu_items;
drop policy if exists "feature_access_read_menu_items" on public.menu_items;
create policy "feature_access_read_menu_items"
  on public.menu_items for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','menu','cashier','reports','settings']));

drop policy if exists "owner_admin_write_menu_items" on public.menu_items;
drop policy if exists "feature_access_write_menu_items" on public.menu_items;
create policy "feature_access_write_menu_items"
  on public.menu_items for all
  to authenticated
  using (public.current_staff_can_access('menu'))
  with check (public.current_staff_can_access('menu'));

-- Waiter/cashier pages need table rows; Settings manages table metadata/zones.
drop policy if exists "staff_all_table_zones" on public.table_zones;
drop policy if exists "staff_read_table_zones" on public.table_zones;
drop policy if exists "feature_access_read_table_zones" on public.table_zones;
create policy "feature_access_read_table_zones"
  on public.table_zones for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','cashier','reports','settings']));

drop policy if exists "owner_admin_write_table_zones" on public.table_zones;
drop policy if exists "feature_access_write_table_zones" on public.table_zones;
create policy "feature_access_write_table_zones"
  on public.table_zones for all
  to authenticated
  using (public.current_staff_can_access('settings'))
  with check (public.current_staff_can_access('settings'));

drop policy if exists "staff_all_tables" on public.restaurant_tables;
drop policy if exists "staff_read_restaurant_tables" on public.restaurant_tables;
drop policy if exists "feature_access_read_restaurant_tables" on public.restaurant_tables;
create policy "feature_access_read_restaurant_tables"
  on public.restaurant_tables for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','cashier','reports','settings']));

drop policy if exists "owner_admin_manage_restaurant_tables" on public.restaurant_tables;
drop policy if exists "feature_access_manage_restaurant_tables" on public.restaurant_tables;
create policy "feature_access_manage_restaurant_tables"
  on public.restaurant_tables for all
  to authenticated
  using (public.current_staff_can_access('settings'))
  with check (public.current_staff_can_access('settings'));

drop policy if exists "staff_update_restaurant_table_status" on public.restaurant_tables;
drop policy if exists "feature_access_update_restaurant_table_status" on public.restaurant_tables;
create policy "feature_access_update_restaurant_table_status"
  on public.restaurant_tables for update
  to authenticated
  using (public.current_staff_can_access_any(array['tables','cashier']))
  with check (public.current_staff_can_access_any(array['tables','cashier']));

-- Business settings are read by all internal surfaces for service-rate math.
drop policy if exists "staff_read_business_settings" on public.business_settings;
drop policy if exists "feature_access_read_business_settings" on public.business_settings;
create policy "feature_access_read_business_settings"
  on public.business_settings for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','menu','cashier','loyalty','expenses','team','reports','audit','settings']));

drop policy if exists "owner_admin_manage_business_settings" on public.business_settings;
drop policy if exists "feature_access_manage_business_settings" on public.business_settings;
create policy "feature_access_manage_business_settings"
  on public.business_settings for all
  to authenticated
  using (public.current_staff_can_access('settings'))
  with check (public.current_staff_can_access('settings'));

-- Split-payment rows are needed for waiter/cashier/reports totals.
drop policy if exists "staff can read order payments" on public.order_payments;
drop policy if exists "feature_access_read_order_payments" on public.order_payments;
create policy "feature_access_read_order_payments"
  on public.order_payments for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','cashier','reports']));

drop policy if exists "cashiers can insert order payments" on public.order_payments;
drop policy if exists "feature_access_insert_order_payments" on public.order_payments;
create policy "feature_access_insert_order_payments"
  on public.order_payments for insert
  to authenticated
  with check (public.current_staff_can_access('cashier'));

drop policy if exists "cashiers can replace unpaid order payments" on public.order_payments;
drop policy if exists "feature_access_replace_unpaid_order_payments" on public.order_payments;
create policy "feature_access_replace_unpaid_order_payments"
  on public.order_payments for delete
  to authenticated
  using (
    public.current_staff_can_access('cashier')
    and exists (
      select 1
      from public.orders o
      where o.id = order_payments.order_id
        and coalesce(o.payment_status, 'unpaid') <> 'paid'
    )
  );

-- Item cancellation records support kitchen/waiter unavailable-item flows.
drop policy if exists "Staff: read order item cancellations" on public.order_item_cancellations;
drop policy if exists "feature_access_read_order_item_cancellations" on public.order_item_cancellations;
create policy "feature_access_read_order_item_cancellations"
  on public.order_item_cancellations for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','cashier','reports','audit']));

drop policy if exists "Kitchen: insert order item cancellations" on public.order_item_cancellations;
drop policy if exists "feature_access_insert_order_item_cancellations" on public.order_item_cancellations;
create policy "feature_access_insert_order_item_cancellations"
  on public.order_item_cancellations for insert
  to authenticated
  with check (public.current_staff_can_access('tables'));
