-- ============================================================
-- Zar Kebab POS — Hardening for profile updates, payments, sorting
-- Run after 001_profiles.sql and 003_pos_schema.sql on existing projects.
-- ============================================================

-- Payment metadata used by CashierBill, Reports, and dashboards.
alter table public.orders
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists service_rate_pct integer not null default 20;

-- Owner helper: active owner only.
create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'owner'
      and status = 'active'
  )
$$;

-- Replace broad admin profile update access with role-aware policies.
drop policy if exists "Users: update own safe fields" on public.profiles;
drop policy if exists "Admin: update any profile" on public.profiles;
drop policy if exists "Owner: update any profile" on public.profiles;
drop policy if exists "Admin: update staff profiles" on public.profiles;

create policy "Users: update own safe fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    role   = (select role   from public.profiles where id = auth.uid()) and
    status = (select status from public.profiles where id = auth.uid())
  );

create policy "Owner: update any profile"
  on public.profiles for update
  using (public.is_owner())
  with check (public.is_owner());

create policy "Admin: update staff profiles"
  on public.profiles for update
  using (
    public.is_admin()
    and not public.is_owner()
    and id <> auth.uid()
    and role not in ('owner', 'stakeholder')
  )
  with check (
    public.is_admin()
    and not public.is_owner()
    and role not in ('owner', 'stakeholder')
  );
