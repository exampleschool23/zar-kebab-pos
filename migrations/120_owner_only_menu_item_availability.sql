-- Meal availability is an owner-controlled operational setting. Staff with
-- Menu write access may continue editing every other product field.

begin;

create or replace function public.enforce_owner_only_menu_item_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted SQL/migration sessions have no authenticated user. Service jobs
  -- must remain able to maintain catalog rows outside an end-user session.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.available is distinct from true and not public.is_owner() then
      raise exception 'Only the owner can create an unavailable menu item'
        using errcode = '42501';
    end if;
  elsif old.available is distinct from new.available and not public.is_owner() then
    raise exception 'Only the owner can change menu item availability'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_owner_only_menu_item_availability()
  from public, anon, authenticated;

drop trigger if exists trg_owner_only_menu_item_availability_insert
  on public.menu_items;
create trigger trg_owner_only_menu_item_availability_insert
  before insert on public.menu_items
  for each row
  execute function public.enforce_owner_only_menu_item_availability();

drop trigger if exists trg_owner_only_menu_item_availability_update
  on public.menu_items;
create trigger trg_owner_only_menu_item_availability_update
  before update of available on public.menu_items
  for each row
  when (old.available is distinct from new.available)
  execute function public.enforce_owner_only_menu_item_availability();

commit;

notify pgrst, 'reload schema';
