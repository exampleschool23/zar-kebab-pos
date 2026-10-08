-- Keep intentional staff deletions separate from genuine new approval requests.
-- Future deletions go through the Auth Admin API. This one-time cleanup removes
-- auth accounts that migration 091 previously resurrected as pending profiles,
-- but only when the account has not signed in since the recorded deletion.

with deleted_accounts as (
  select profiles.id
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  join lateral (
    select max(audit.changed_at) as deleted_at
    from public.profile_audit as audit
    where audit.profile_id = profiles.id
      and audit.action = 'profile_deleted'
  ) as deletion on deletion.deleted_at is not null
  where profiles.role = 'guest'
    and profiles.status = 'pending'
    and profiles.created_at >= deletion.deleted_at
    and coalesce(users.last_sign_in_at, users.created_at) <= deletion.deleted_at
    and lower(coalesce(profiles.email, users.email, '')) <> 'dangerhoggish@gmail.com'
)
delete from auth.users as users
using deleted_accounts
where users.id = deleted_accounts.id;

create or replace function public.prevent_existing_profile_from_becoming_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pending' and new.status = 'pending' then
    raise exception 'Only newly joined accounts can be pending approval';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_existing_profile_from_becoming_pending on public.profiles;

create trigger prevent_existing_profile_from_becoming_pending
  before update of status on public.profiles
  for each row
  execute function public.prevent_existing_profile_from_becoming_pending();
