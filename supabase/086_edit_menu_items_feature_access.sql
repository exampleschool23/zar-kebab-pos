-- Add a separately grantable menu-edit permission. The existing `menu`
-- feature continues to grant page access and preserves owner/admin editing.

alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or feature_access <@ array[
      'dashboard',
      'tables',
      'menu',
      'edit_menu_items',
      'cashier',
      'loyalty',
      'expenses',
      'team',
      'reports',
      'audit',
      'settings',
      'move_back_to_table',
      'delete_paid_orders'
    ]::text[]
  );

drop policy if exists "feature_access_read_menu_categories" on public.menu_categories;
create policy "feature_access_read_menu_categories"
  on public.menu_categories for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','menu','edit_menu_items','cashier','reports','settings']));

drop policy if exists "feature_access_write_menu_categories" on public.menu_categories;
create policy "feature_access_write_menu_categories"
  on public.menu_categories for all
  to authenticated
  using (
    public.current_staff_can_write('menu')
    or public.current_staff_can_access('edit_menu_items')
  )
  with check (
    public.current_staff_can_write('menu')
    or public.current_staff_can_access('edit_menu_items')
  );

drop policy if exists "feature_access_read_menu_items" on public.menu_items;
create policy "feature_access_read_menu_items"
  on public.menu_items for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','menu','edit_menu_items','cashier','reports','settings']));

drop policy if exists "feature_access_write_menu_items" on public.menu_items;
create policy "feature_access_write_menu_items"
  on public.menu_items for all
  to authenticated
  using (
    public.current_staff_can_write('menu')
    or public.current_staff_can_access('edit_menu_items')
  )
  with check (
    public.current_staff_can_write('menu')
    or public.current_staff_can_access('edit_menu_items')
  );

drop policy if exists "feature_access_read_business_settings" on public.business_settings;
create policy "feature_access_read_business_settings"
  on public.business_settings for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','menu','edit_menu_items','cashier','loyalty','expenses','team','reports','audit','settings']));
