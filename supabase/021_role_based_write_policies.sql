-- Tighten management writes by role while preserving operational table/order flow.
-- This migration is intentionally defensive: production may have skipped older
-- table-management/settings migrations, so create the policy target tables and
-- metadata columns before dropping/creating policies.

create table if not exists public.table_zones (
  id         text        primary key,
  name       text        not null unique,
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_tables
  add column if not exists zone_id text references public.table_zones(id) on delete set null,
  add column if not exists zone_name text not null default 'Main Hall',
  add column if not exists capacity integer not null default 4 check (capacity > 0),
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

insert into public.table_zones (id, name, sort_order, is_active) values
  ('main-hall',    'Main Hall',    1, true),
  ('vip',          'VIP',          2, true),
  ('outdoor',      'Outdoor',      3, true),
  ('second-floor', 'Second Floor', 4, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

create table if not exists public.business_settings (
  id               text primary key default 'default',
  restaurant_name  text not null default 'Zar Kebab',
  service_rate_pct integer not null default 20
                   check (service_rate_pct between 0 and 100),
  receipt_footer   text not null default 'Thank you for visiting!',
  auto_print       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into public.business_settings (id, restaurant_name, service_rate_pct, receipt_footer, auto_print)
values ('default', 'Zar Kebab', 20, 'Thank you for visiting!', false)
on conflict (id) do nothing;

alter table public.table_zones enable row level security;
alter table public.business_settings enable row level security;

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
