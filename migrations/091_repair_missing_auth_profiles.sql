-- Repair auth accounts that were created without a matching public profile.
-- Missing profiles cannot appear on the Team page, leaving owners unable to
-- assign a role or approve the account.

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
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, full_name, role, status)
select
  users.id,
  users.email,
  coalesce(
    users.raw_user_meta_data->>'full_name',
    users.raw_user_meta_data->>'name',
    ''
  ),
  'guest',
  'pending'
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
)
and not exists (
  -- A deleted staff account is not a new approval request. Only restore it if
  -- the person signed in again after the owner's most recent deletion.
  select 1
  from public.profile_audit as audit
  where audit.profile_id = users.id
    and audit.action = 'profile_deleted'
    and audit.changed_at >= coalesce(users.last_sign_in_at, '-infinity'::timestamptz)
);
