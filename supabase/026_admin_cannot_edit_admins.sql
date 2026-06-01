-- Admins can manage staff below admin, but cannot change other admins.
-- Owners remain the only role allowed to change admin accounts.

drop policy if exists "Admin: update staff profiles" on public.profiles;

create policy "Admin: update staff profiles"
  on public.profiles for update
  using (
    public.is_admin()
    and not public.is_owner()
    and id <> auth.uid()
    and role not in ('owner', 'admin', 'stakeholder')
  )
  with check (
    public.is_admin()
    and not public.is_owner()
    and role not in ('owner', 'admin', 'stakeholder')
  );
