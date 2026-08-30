-- Restrict ingredient catalog mutations to active owners. Daily Bazaar
-- purchases retain their existing owner/admin write permissions.
begin;

create or replace function public.current_staff_can_manage_bazaar_ingredients()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select profile.status::text = 'active'
      and profile.role::text = 'owner'
      and public.current_staff_can_access('bazaar')
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false);
$$;

create or replace function public.mark_bazaar_catalog_managed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.daily_bazaar_catalog_rpc', true) = 'on' then
    if not public.current_staff_can_manage_bazaar_ingredients() then
      raise exception 'Only an owner can manage Daily Bazaar ingredients';
    end if;
    new.is_catalog_managed := true;
  elsif tg_op = 'UPDATE' then
    new.is_catalog_managed := old.is_catalog_managed;
  end if;
  return new;
end;
$$;

revoke all on function public.current_staff_can_manage_bazaar_ingredients() from public, anon;
grant execute on function public.current_staff_can_manage_bazaar_ingredients() to authenticated;
revoke all on function public.mark_bazaar_catalog_managed() from public, anon, authenticated;

commit;
