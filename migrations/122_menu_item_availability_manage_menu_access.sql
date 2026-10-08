-- Availability is an operational waiter-menu setting. Any staff member with
-- Manage Menu write access may set it when creating or updating a product.

begin;

create or replace function public.enforce_owner_only_menu_item_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted SQL/migration sessions have no authenticated user.
  if auth.uid() is null then
    return new;
  end if;

  if not coalesce(public.current_staff_can_write('menu'), false) then
    raise exception 'Manage Menu access is required to change menu item availability'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_owner_only_menu_item_availability()
  from public, anon, authenticated;

-- Keep the existing insert/update triggers from migration 120; replacing the
-- function updates their authorization rule without changing their scope.

commit;

notify pgrst, 'reload schema';
