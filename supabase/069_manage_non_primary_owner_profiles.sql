-- Let the primary owner manage other owner-labeled profiles.
-- The primary owner remains protected; other owners can be restricted by
-- feature_access and removed like staff if needed.

drop policy if exists "Owner: delete staff profiles" on public.profiles;

create policy "Owner: delete staff profiles"
  on public.profiles for delete
  using (
    public.is_feature_access_manager()
    and id <> auth.uid()
    and role <> 'stakeholder'
    and lower(coalesce(email, '')) <> 'dangerhoggish@gmail.com'
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
        when p.role = 'owner' and lower(p.email) = 'dangerhoggish@gmail.com' then true
        when p.feature_access is not null then feature_key = any(p.feature_access)
        when p.role = 'owner' then true
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
