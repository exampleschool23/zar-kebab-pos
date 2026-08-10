-- Hiding a meal from the public menu is an owner-controlled setting. Staff
-- with Menu write access may continue editing every other product field.

begin;

create or replace function public.enforce_owner_only_menu_item_public_visibility()
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
    if new.public_hidden is distinct from false and not public.is_owner() then
      raise exception 'Only the owner can create a menu item hidden from the public menu'
        using errcode = '42501';
    end if;
  elsif old.public_hidden is distinct from new.public_hidden and not public.is_owner() then
    raise exception 'Only the owner can change public menu visibility'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_owner_only_menu_item_public_visibility()
  from public, anon, authenticated;

drop trigger if exists trg_owner_only_menu_item_public_visibility_insert
  on public.menu_items;
create trigger trg_owner_only_menu_item_public_visibility_insert
  before insert on public.menu_items
  for each row
  execute function public.enforce_owner_only_menu_item_public_visibility();

drop trigger if exists trg_owner_only_menu_item_public_visibility_update
  on public.menu_items;
create trigger trg_owner_only_menu_item_public_visibility_update
  before update of public_hidden on public.menu_items
  for each row
  when (old.public_hidden is distinct from new.public_hidden)
  execute function public.enforce_owner_only_menu_item_public_visibility();

commit;

notify pgrst, 'reload schema';
