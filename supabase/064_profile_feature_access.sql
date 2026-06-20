-- Per-user feature access.
-- A null feature_access uses the user's role defaults. A non-null array is an
-- owner-managed explicit list of enabled app features for that profile.

alter table public.profiles
  add column if not exists feature_access text[];

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
      'cashier',
      'loyalty',
      'expenses',
      'team',
      'reports',
      'audit',
      'settings'
    ]::text[]
  );

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
        when p.role = 'owner' then true
        when p.feature_access is not null then feature_key = any(p.feature_access)
        when feature_key = 'dashboard' then p.role in ('admin', 'cashier', 'stakeholder')
        when feature_key = 'tables' then p.role in ('admin', 'waiter', 'cashier')
        when feature_key = 'menu' then p.role in ('admin')
        when feature_key = 'cashier' then p.role in ('admin', 'cashier')
        when feature_key = 'loyalty' then p.role in ('admin', 'cashier')
        when feature_key = 'expenses' then false
        when feature_key = 'team' then p.role in ('admin', 'waiter', 'cashier', 'stakeholder')
        when feature_key = 'reports' then p.role in ('admin', 'cashier', 'stakeholder')
        when feature_key = 'audit' then p.role in ('admin')
        when feature_key = 'settings' then p.role in ('admin')
        else false
      end
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

grant execute on function public.current_staff_can_access(text) to authenticated;

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

drop trigger if exists prevent_non_owner_feature_access_update on public.profiles;
create trigger prevent_non_owner_feature_access_update
  before update of feature_access on public.profiles
  for each row
  execute function public.prevent_non_owner_feature_access_update();

drop policy if exists "owner_read_expenses" on public.expenses;
drop policy if exists "feature_access_read_expenses" on public.expenses;
create policy "feature_access_read_expenses"
  on public.expenses for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_read_employee_salary_profiles" on public.employee_salary_profiles;
drop policy if exists "feature_access_read_employee_salary_profiles" on public.employee_salary_profiles;
create policy "feature_access_read_employee_salary_profiles"
  on public.employee_salary_profiles for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_read_employee_salary_rates" on public.employee_salary_rates;
drop policy if exists "feature_access_read_employee_salary_rates" on public.employee_salary_rates;
create policy "feature_access_read_employee_salary_rates"
  on public.employee_salary_rates for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_read_employee_salary_payments" on public.employee_salary_payments;
drop policy if exists "feature_access_read_employee_salary_payments" on public.employee_salary_payments;
create policy "feature_access_read_employee_salary_payments"
  on public.employee_salary_payments for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_read_employee_salary_bonuses" on public.employee_salary_bonuses;
drop policy if exists "feature_access_read_employee_salary_bonuses" on public.employee_salary_bonuses;
create policy "feature_access_read_employee_salary_bonuses"
  on public.employee_salary_bonuses for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "owner_read_employee_salary_absences" on public.employee_salary_absences;
drop policy if exists "feature_access_read_employee_salary_absences" on public.employee_salary_absences;
create policy "feature_access_read_employee_salary_absences"
  on public.employee_salary_absences for select
  to authenticated
  using (public.current_staff_can_access('expenses'));
