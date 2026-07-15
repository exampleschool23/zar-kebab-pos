-- Moving a bill back is part of cashier correction work. Any active owner or
-- admin with Cashier access may do it; viewers and users without Cashier access
-- remain blocked. The old separate move_back_to_table flag is no longer needed.

-- SQL Editor and migration sessions have no auth.uid(). Permit those trusted
-- maintenance sessions while continuing to block authenticated non-owners.
create or replace function public.prevent_non_owner_feature_access_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.feature_access is distinct from new.feature_access
    and auth.uid() is not null
    and not public.is_owner() then
    raise exception 'Only owners can change feature access';
  end if;
  return new;
end;
$$;

update public.profiles
set feature_access = array_remove(feature_access, 'move_back_to_table')
where feature_access is not null
  and 'move_back_to_table' = any(feature_access);

alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or (
      feature_access <@ array[
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
        'delete_paid_orders'
      ]::text[]
      and (
        not ('delete_paid_orders' = any(feature_access))
        or feature_access && array['dashboard','cashier','reports']::text[]
      )
    )
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
        when profile.status <> 'active' then false
        when profile.role = 'owner' and lower(coalesce(profile.email, '')) = 'dangerhoggish@gmail.com' then true
        when feature_key = 'delete_paid_orders'
          and profile.role not in ('owner', 'admin') then false
        when profile.feature_access is not null then feature_key = any(profile.feature_access)
        when profile.role = 'owner' then true
        else false
      end
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false);
$$;

grant execute on function public.current_staff_can_access(text) to authenticated;

create or replace function public.guard_recall_from_cashier_permission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'needs_bill'
    and new.status = 'sent_to_kitchen'
    and not public.current_staff_can_write('cashier') then
    raise exception 'Cashier access is required to move a bill back to its table' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.recall_table_from_cashier(p_table_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recalled_order_count integer := 0;
  updated_table_count integer := 0;
begin
  if not public.current_staff_can_write('cashier') then
    raise exception 'Cashier access is required to move a bill back to its table' using errcode = '42501';
  end if;

  update public.orders
  set status = 'sent_to_kitchen'
  where table_id = p_table_id
    and payment_status is distinct from 'paid'
    and status = 'needs_bill';
  get diagnostics recalled_order_count = row_count;

  if recalled_order_count = 0 then
    raise exception 'No bill is available to move back to the table' using errcode = 'P0002';
  end if;

  update public.restaurant_tables
  set status = 'occupied', updated_at = now()
  where id = p_table_id
    and status = 'needs_bill';
  get diagnostics updated_table_count = row_count;

  if updated_table_count = 0 then
    raise exception 'Table is not waiting for a bill' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'table_id', p_table_id,
    'recalled_orders', recalled_order_count
  );
end;
$$;

revoke all on function public.recall_table_from_cashier(text) from public;
grant execute on function public.recall_table_from_cashier(text) to authenticated;
