-- ============================================================
-- Zar Kebab POS — User Profiles
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Profiles table
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text        default '',
  phone       text        default '',
  role        text        not null default 'guest'
                          check (role in ('owner', 'admin', 'waiter', 'cashier', 'kitchen', 'stakeholder', 'guest')),
  status      text        not null default 'active'
                          check (status in ('pending', 'active', 'disabled')),
  created_at  timestamptz not null default now()
);

-- 2. Enable Row Level Security
alter table public.profiles enable row level security;

-- 3. All authenticated users can read ALL profiles (team visibility for every role)
create policy "Authenticated: read all profiles"
  on public.profiles for select
  using (auth.uid() is not null);

-- 4. Helper function — used by admin policies to avoid infinite recursion
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
  )
$$;

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

-- 6. Users can update their own non-sensitive fields (name, phone only)
drop policy if exists "Users: update own safe fields" on public.profiles;
create policy "Users: update own safe fields"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    role   = (select role   from public.profiles where id = auth.uid()) and
    status = (select status from public.profiles where id = auth.uid())
  );

-- 7. Owner can update any profile. Admin can update only non-owner/non-stakeholder users
-- and cannot assign owner/stakeholder. Frontend checks are convenience; RLS is authority.
drop policy if exists "Admin: update any profile" on public.profiles;
drop policy if exists "Owner: update any profile" on public.profiles;
drop policy if exists "Admin: update staff profiles" on public.profiles;

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

-- 7. Trigger: auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    'guest',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop trigger if exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- HOW TO CREATE YOUR FIRST OWNER ACCOUNT:
--
-- 1. Sign up normally through the app (email or Google)
-- 2. Come back here and run:
--
--    update public.profiles
--    set role = 'owner', status = 'active'
--    where email = 'your@email.com';
--
-- That's it — you're now the owner with full access.
-- ============================================================
