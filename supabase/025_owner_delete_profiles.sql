-- Allow owners to remove staff profile rows while preserving historical order names.
-- Orders/reports store display names such as waiter_name directly on the order,
-- so this policy intentionally deletes only public.profiles rows.

alter table public.profiles enable row level security;

drop policy if exists "Owner: delete staff profiles" on public.profiles;

create policy "Owner: delete staff profiles"
  on public.profiles for delete
  using (
    public.is_owner()
    and id <> auth.uid()
    and role not in ('owner', 'stakeholder')
  );
