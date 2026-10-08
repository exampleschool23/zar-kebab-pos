-- Allow owners to grant the cashier "move back to table" action explicitly.

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
      'settings',
      'move_back_to_table',
      'delete_paid_orders'
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
        when feature_key = 'move_back_to_table' then false
        when feature_key = 'delete_paid_orders' then false
        else false
      end
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

grant execute on function public.current_staff_can_access(text) to authenticated;
