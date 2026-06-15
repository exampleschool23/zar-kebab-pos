-- Restrict expenses to the owner role only.

drop policy if exists "staff_read_expenses" on public.expenses;
drop policy if exists "accounting_staff_insert_expenses" on public.expenses;
drop policy if exists "owner_admin_update_expenses" on public.expenses;
drop policy if exists "owner_admin_delete_expenses" on public.expenses;
drop policy if exists "owner_read_expenses" on public.expenses;
drop policy if exists "owner_insert_expenses" on public.expenses;
drop policy if exists "owner_update_expenses" on public.expenses;
drop policy if exists "owner_delete_expenses" on public.expenses;

create policy "owner_read_expenses"
  on public.expenses for select
  to authenticated
  using (public.current_staff_has_role(array['owner']));

create policy "owner_insert_expenses"
  on public.expenses for insert
  to authenticated
  with check (
    public.current_staff_has_role(array['owner'])
    and created_by = auth.uid()
  );

create policy "owner_update_expenses"
  on public.expenses for update
  to authenticated
  using (public.current_staff_has_role(array['owner']))
  with check (public.current_staff_has_role(array['owner']));

create policy "owner_delete_expenses"
  on public.expenses for delete
  to authenticated
  using (public.current_staff_has_role(array['owner']));

