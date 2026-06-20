-- Restrict feature-access management to the primary owner account only.
-- Other owners keep their normal app access, but they cannot grant or revoke
-- per-user feature access.

create or replace function public.is_feature_access_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role = 'owner'
      and lower(p.email) = 'dangerhoggish@gmail.com'
  );
$$;

grant execute on function public.is_feature_access_manager() to authenticated;

create or replace function public.prevent_non_owner_feature_access_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.feature_access is distinct from new.feature_access and not public.is_feature_access_manager() then
    raise exception 'Only the primary owner can change feature access';
  end if;
  return new;
end;
$$;
