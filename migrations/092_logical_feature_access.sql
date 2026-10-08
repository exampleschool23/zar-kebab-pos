-- Consolidate menu page/edit access and keep only genuinely sensitive actions
-- as separate permissions. Also repair stale action/page combinations.

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
set feature_access = array_append(feature_access, 'menu')
where feature_access is not null
  and 'edit_menu_items' = any(feature_access)
  and not ('menu' = any(feature_access));

update public.profiles
set feature_access = array_remove(feature_access, 'edit_menu_items')
where feature_access is not null
  and 'edit_menu_items' = any(feature_access);

update public.profiles as profile
set feature_access = (
  select coalesce(array_agg(entry.feature_key order by entry.ordinality), array[]::text[])
  from unnest(profile.feature_access) with ordinality as entry(feature_key, ordinality)
  where case entry.feature_key
    when 'move_back_to_table' then 'cashier' = any(profile.feature_access)
    when 'delete_paid_orders' then profile.feature_access && array['dashboard','cashier','reports']::text[]
    else true
  end
)
where profile.feature_access is not null;

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
        'move_back_to_table',
        'delete_paid_orders'
      ]::text[]
      and (
        not ('move_back_to_table' = any(feature_access))
        or 'cashier' = any(feature_access)
      )
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
        when feature_key in ('move_back_to_table', 'delete_paid_orders')
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

-- Remove the original authenticated-user catch-all policies. They are
-- permissive policies, so leaving them in place would bypass every feature gate.
drop policy if exists staff_all_orders on public.orders;
drop policy if exists staff_read_orders on public.orders;
drop policy if exists feature_access_read_orders on public.orders;
drop policy if exists feature_access_insert_orders on public.orders;
drop policy if exists feature_access_update_orders on public.orders;
drop policy if exists feature_access_delete_orders on public.orders;

create policy feature_access_read_orders
  on public.orders for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','cashier','loyalty','expenses','reports','audit','settings']));

create policy feature_access_insert_orders
  on public.orders for insert
  to authenticated
  with check (
    public.current_staff_can_write('tables')
    or public.current_staff_can_write('cashier')
  );

create policy feature_access_update_orders
  on public.orders for update
  to authenticated
  using (
    public.current_staff_can_write('tables')
    or public.current_staff_can_write('cashier')
  )
  with check (
    public.current_staff_can_write('tables')
    or public.current_staff_can_write('cashier')
  );

drop policy if exists staff_all_order_items on public.order_items;
drop policy if exists staff_read_order_items on public.order_items;
drop policy if exists feature_access_read_order_items on public.order_items;
drop policy if exists feature_access_insert_order_items on public.order_items;
drop policy if exists feature_access_update_order_items on public.order_items;
drop policy if exists feature_access_delete_order_items on public.order_items;

create policy feature_access_read_order_items
  on public.order_items for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','tables','cashier','loyalty','expenses','reports','audit','settings']));

create policy feature_access_insert_order_items
  on public.order_items for insert
  to authenticated
  with check (
    public.current_staff_can_write('tables')
    or public.current_staff_can_write('cashier')
  );

create policy feature_access_update_order_items
  on public.order_items for update
  to authenticated
  using (
    public.current_staff_can_write('tables')
    or public.current_staff_can_write('cashier')
  )
  with check (
    public.current_staff_can_write('tables')
    or public.current_staff_can_write('cashier')
  );

create policy feature_access_delete_order_items
  on public.order_items for delete
  to authenticated
  using (
    public.current_staff_can_write('tables')
    or public.current_staff_can_write('cashier')
  );

create or replace function public.guard_recall_from_cashier_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'needs_bill'
    and new.status = 'sent_to_kitchen'
    and not (
      public.current_staff_can_write('cashier')
      and public.current_staff_can_access('move_back_to_table')
    ) then
    raise exception 'Move back to table access is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_recall_from_cashier_permission on public.orders;
create trigger guard_recall_from_cashier_permission
  before update of status on public.orders
  for each row execute function public.guard_recall_from_cashier_permission();

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
  if not public.current_staff_can_write('cashier')
    or not public.current_staff_can_access('move_back_to_table') then
    raise exception 'Move back to table access is required' using errcode = '42501';
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
