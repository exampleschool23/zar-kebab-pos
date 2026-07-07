-- Collapse staff roles to owner/admin/viewer/guest and make feature access
-- the source of truth for both page visibility and write permissions.

alter table public.profiles
  add column if not exists feature_access text[];

alter table public.profiles
  alter column role set default 'guest';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

drop trigger if exists prevent_non_owner_feature_access_update on public.profiles;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or feature_access <@ array[
      'dashboard',
      'tables',
      'menu',
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

update public.profiles
set feature_access = array['dashboard','tables','menu','cashier','loyalty','team','reports','audit','settings']::text[]
where role = 'admin'
  and feature_access is null;

update public.profiles
set feature_access = array['tables','team']::text[]
where role = 'waiter'
  and feature_access is null;

update public.profiles
set feature_access = array['dashboard','tables','cashier','loyalty','team','reports']::text[]
where role = 'cashier'
  and feature_access is null;

update public.profiles
set feature_access = array['dashboard','team','reports']::text[]
where role = 'stakeholder'
  and feature_access is null;

update public.profiles
set feature_access = array['tables']::text[]
where role = 'kitchen'
  and feature_access is null;

update public.profiles
set role = 'viewer'
where role = 'stakeholder';

update public.profiles
set role = 'admin'
where role in ('waiter', 'cashier', 'kitchen');

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'viewer', 'guest'));

create or replace function public.current_staff_can_access(feature_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select
      case
        when p.status <> 'active' then false
        when p.role = 'owner' and lower(coalesce(p.email, '')) = 'dangerhoggish@gmail.com' then true
        when p.feature_access is not null then feature_key = any(p.feature_access)
        when p.role = 'owner' then true
        else false
      end
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

grant execute on function public.current_staff_can_access(text) to authenticated;

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

create or replace function public.current_staff_can_write(feature_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select p.status = 'active'
      and p.role in ('owner', 'admin')
      and public.current_staff_can_access(feature_key)
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

grant execute on function public.current_staff_can_write(text) to authenticated;

create or replace function public.prevent_non_owner_feature_access_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.feature_access is distinct from new.feature_access and not public.is_owner() then
    raise exception 'Only owners can change feature access';
  end if;
  return new;
end;
$$;

create trigger prevent_non_owner_feature_access_update
  before update of feature_access on public.profiles
  for each row
  execute function public.prevent_non_owner_feature_access_update();

drop policy if exists "Owner: delete staff profiles" on public.profiles;
create policy "Owner: delete staff profiles"
  on public.profiles for delete
  using (
    public.is_owner()
    and id <> auth.uid()
    and role <> 'owner'
  );

drop policy if exists "Admin: update staff profiles" on public.profiles;
create policy "Admin: update staff profiles"
  on public.profiles for update
  using (
    public.current_staff_role() = 'admin'
    and public.current_staff_can_write('team')
    and id <> auth.uid()
    and role in ('viewer', 'guest')
  )
  with check (
    public.current_staff_role() = 'admin'
    and public.current_staff_can_write('team')
    and role in ('viewer', 'guest')
  );

drop policy if exists "feature_access_write_menu_categories" on public.menu_categories;
create policy "feature_access_write_menu_categories"
  on public.menu_categories for all
  to authenticated
  using (public.current_staff_can_write('menu'))
  with check (public.current_staff_can_write('menu'));

drop policy if exists "feature_access_write_menu_items" on public.menu_items;
create policy "feature_access_write_menu_items"
  on public.menu_items for all
  to authenticated
  using (public.current_staff_can_write('menu'))
  with check (public.current_staff_can_write('menu'));

drop policy if exists "feature_access_write_table_zones" on public.table_zones;
create policy "feature_access_write_table_zones"
  on public.table_zones for all
  to authenticated
  using (public.current_staff_can_write('settings'))
  with check (public.current_staff_can_write('settings'));

drop policy if exists "feature_access_manage_restaurant_tables" on public.restaurant_tables;
create policy "feature_access_manage_restaurant_tables"
  on public.restaurant_tables for all
  to authenticated
  using (public.current_staff_can_write('settings'))
  with check (public.current_staff_can_write('settings'));

drop policy if exists "feature_access_update_restaurant_table_status" on public.restaurant_tables;
create policy "feature_access_update_restaurant_table_status"
  on public.restaurant_tables for update
  to authenticated
  using (public.current_staff_can_write('tables') or public.current_staff_can_write('cashier'))
  with check (public.current_staff_can_write('tables') or public.current_staff_can_write('cashier'));

drop policy if exists "feature_access_manage_business_settings" on public.business_settings;
create policy "feature_access_manage_business_settings"
  on public.business_settings for all
  to authenticated
  using (public.current_staff_can_write('settings'))
  with check (public.current_staff_can_write('settings'));

drop policy if exists "feature_access_insert_order_payments" on public.order_payments;
create policy "feature_access_insert_order_payments"
  on public.order_payments for insert
  to authenticated
  with check (public.current_staff_can_write('cashier'));

drop policy if exists "feature_access_replace_unpaid_order_payments" on public.order_payments;
create policy "feature_access_replace_unpaid_order_payments"
  on public.order_payments for delete
  to authenticated
  using (
    public.current_staff_can_write('cashier')
    and exists (
      select 1
      from public.orders o
      where o.id = order_payments.order_id
        and coalesce(o.payment_status, 'unpaid') <> 'paid'
    )
  );

drop policy if exists "feature_access_insert_order_item_cancellations" on public.order_item_cancellations;
create policy "feature_access_insert_order_item_cancellations"
  on public.order_item_cancellations for insert
  to authenticated
  with check (public.current_staff_can_write('tables'));

drop policy if exists "staff_read_loyalty_cards" on public.loyalty_cards;
drop policy if exists "feature_access_read_loyalty_cards" on public.loyalty_cards;
create policy "feature_access_read_loyalty_cards"
  on public.loyalty_cards for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','cashier','loyalty','reports']));

drop policy if exists "owner_create_loyalty_cards" on public.loyalty_cards;
drop policy if exists "owner_admin_create_loyalty_cards" on public.loyalty_cards;
drop policy if exists "feature_access_create_loyalty_cards" on public.loyalty_cards;
create policy "feature_access_create_loyalty_cards"
  on public.loyalty_cards for insert
  to authenticated
  with check (public.current_staff_can_write('loyalty'));

drop policy if exists "owner_cashier_update_loyalty_cards" on public.loyalty_cards;
drop policy if exists "feature_access_update_loyalty_cards" on public.loyalty_cards;
create policy "feature_access_update_loyalty_cards"
  on public.loyalty_cards for update
  to authenticated
  using (public.current_staff_can_write('loyalty') or public.current_staff_can_write('cashier'))
  with check (public.current_staff_can_write('loyalty') or public.current_staff_can_write('cashier'));

drop policy if exists "staff_read_loyalty_transactions" on public.loyalty_transactions;
drop policy if exists "feature_access_read_loyalty_transactions" on public.loyalty_transactions;
create policy "feature_access_read_loyalty_transactions"
  on public.loyalty_transactions for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','cashier','loyalty','reports']));

drop policy if exists "owner_cashier_insert_loyalty_transactions" on public.loyalty_transactions;
drop policy if exists "feature_access_insert_loyalty_transactions" on public.loyalty_transactions;
create policy "feature_access_insert_loyalty_transactions"
  on public.loyalty_transactions for insert
  to authenticated
  with check (public.current_staff_can_write('loyalty') or public.current_staff_can_write('cashier'));

drop policy if exists "owner_read_expenses" on public.expenses;
drop policy if exists "feature_access_read_expenses" on public.expenses;
create policy "feature_access_read_expenses"
  on public.expenses for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_insert_expenses" on public.expenses;
drop policy if exists "owner_update_expenses" on public.expenses;
drop policy if exists "owner_delete_expenses" on public.expenses;
drop policy if exists "feature_access_write_expenses" on public.expenses;
create policy "feature_access_write_expenses"
  on public.expenses for all
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));

drop policy if exists "owner_read_employee_salary_profiles" on public.employee_salary_profiles;
drop policy if exists "feature_access_read_employee_salary_profiles" on public.employee_salary_profiles;
create policy "feature_access_read_employee_salary_profiles"
  on public.employee_salary_profiles for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_write_employee_salary_profiles" on public.employee_salary_profiles;
drop policy if exists "feature_access_write_employee_salary_profiles" on public.employee_salary_profiles;
create policy "feature_access_write_employee_salary_profiles"
  on public.employee_salary_profiles for all
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));

drop policy if exists "owner_read_employee_salary_rates" on public.employee_salary_rates;
drop policy if exists "feature_access_read_employee_salary_rates" on public.employee_salary_rates;
create policy "feature_access_read_employee_salary_rates"
  on public.employee_salary_rates for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_write_employee_salary_rates" on public.employee_salary_rates;
drop policy if exists "feature_access_write_employee_salary_rates" on public.employee_salary_rates;
create policy "feature_access_write_employee_salary_rates"
  on public.employee_salary_rates for all
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));

drop policy if exists "owner_read_employee_salary_payments" on public.employee_salary_payments;
drop policy if exists "feature_access_read_employee_salary_payments" on public.employee_salary_payments;
create policy "feature_access_read_employee_salary_payments"
  on public.employee_salary_payments for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_write_employee_salary_payments" on public.employee_salary_payments;
drop policy if exists "feature_access_write_employee_salary_payments" on public.employee_salary_payments;
create policy "feature_access_write_employee_salary_payments"
  on public.employee_salary_payments for all
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));

drop policy if exists "owner_read_employee_salary_bonuses" on public.employee_salary_bonuses;
drop policy if exists "feature_access_read_employee_salary_bonuses" on public.employee_salary_bonuses;
create policy "feature_access_read_employee_salary_bonuses"
  on public.employee_salary_bonuses for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_write_employee_salary_bonuses" on public.employee_salary_bonuses;
drop policy if exists "feature_access_write_employee_salary_bonuses" on public.employee_salary_bonuses;
create policy "feature_access_write_employee_salary_bonuses"
  on public.employee_salary_bonuses for all
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));

drop policy if exists "owner_read_employee_salary_absences" on public.employee_salary_absences;
drop policy if exists "feature_access_read_employee_salary_absences" on public.employee_salary_absences;
create policy "feature_access_read_employee_salary_absences"
  on public.employee_salary_absences for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_write_employee_salary_absences" on public.employee_salary_absences;
drop policy if exists "feature_access_write_employee_salary_absences" on public.employee_salary_absences;
create policy "feature_access_write_employee_salary_absences"
  on public.employee_salary_absences for all
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));
