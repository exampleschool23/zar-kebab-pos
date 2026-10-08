-- Every active internal staff member can inspect the complete menu catalog.
-- The Manage menu feature remains a separate write permission in the existing
-- write policies. Public/guest reads keep their filtered policy.

create or replace function public.current_staff_can_view_menu_catalog()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.role in ('owner', 'admin', 'viewer')
  );
$$;

revoke all on function public.current_staff_can_view_menu_catalog() from public;
grant execute on function public.current_staff_can_view_menu_catalog() to authenticated;

drop policy if exists "feature_access_read_menu_categories" on public.menu_categories;
create policy "feature_access_read_menu_categories"
  on public.menu_categories for select
  to authenticated
  using (public.current_staff_can_view_menu_catalog());

drop policy if exists "feature_access_read_menu_items" on public.menu_items;
create policy "feature_access_read_menu_items"
  on public.menu_items for select
  to authenticated
  using (public.current_staff_can_view_menu_catalog());

notify pgrst, 'reload schema';
