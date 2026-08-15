-- Allow selected signed-in staff members to see a waiter-menu category outside
-- its configured time window. Public/customer menus continue to follow the
-- category schedule, and explicit waiter-hidden/archive rules still win.

begin;

create table if not exists public.menu_category_user_schedule_overrides (
  category_id text not null references public.menu_categories(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (category_id, profile_id)
);

create index if not exists idx_menu_category_schedule_overrides_profile
  on public.menu_category_user_schedule_overrides(profile_id, category_id);

comment on table public.menu_category_user_schedule_overrides is
  'Selected staff who may see a waiter-menu category outside its normal time window.';

alter table public.menu_category_user_schedule_overrides enable row level security;
revoke all on table public.menu_category_user_schedule_overrides from public, anon, authenticated;
grant select on table public.menu_category_user_schedule_overrides to authenticated;

drop policy if exists "Staff can read their category schedule overrides"
  on public.menu_category_user_schedule_overrides;
create policy "Staff can read their category schedule overrides"
  on public.menu_category_user_schedule_overrides
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.status = 'active'
        and viewer.role::text = 'owner'
    )
  );

create or replace function public.set_menu_category_user_schedule_overrides(
  p_category_id text,
  p_profile_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_profile_ids uuid[];
begin
  if not exists (
    select 1
    from public.profiles actor
    where actor.id = auth.uid()
      and actor.status = 'active'
      and actor.role::text = 'owner'
  ) then
    raise exception 'Only owners can manage category schedule overrides' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.menu_categories category
    where category.id = p_category_id
      and category.deleted_at is null
  ) then
    raise exception 'Active menu category not found';
  end if;

  select coalesce(array_agg(distinct requested.profile_id), '{}'::uuid[])
    into normalized_profile_ids
  from unnest(coalesce(p_profile_ids, '{}'::uuid[])) requested(profile_id);

  if exists (
    select 1
    from unnest(normalized_profile_ids) requested(profile_id)
    left join public.profiles profile on profile.id = requested.profile_id
    where profile.id is null
      or profile.role::text = 'guest'
  ) then
    raise exception 'Category schedule overrides require staff profiles';
  end if;

  delete from public.menu_category_user_schedule_overrides override_row
  where override_row.category_id = p_category_id;

  insert into public.menu_category_user_schedule_overrides (
    category_id,
    profile_id,
    created_by
  )
  select
    p_category_id,
    requested.profile_id,
    auth.uid()
  from unnest(normalized_profile_ids) requested(profile_id);
end;
$$;

revoke all on function public.set_menu_category_user_schedule_overrides(text, uuid[]) from public, anon;
grant execute on function public.set_menu_category_user_schedule_overrides(text, uuid[]) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'menu_category_user_schedule_overrides'
  ) then
    alter publication supabase_realtime
      add table public.menu_category_user_schedule_overrides;
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
