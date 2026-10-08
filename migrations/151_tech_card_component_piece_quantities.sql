-- Keep piece-based set/combo contents compatible with integer shelf stock.
-- This is intentionally separate from migration 150 so deployment never holds
-- trigger locks on the component and orders tables in the same transaction.

-- Validate existing rows in a read-only transaction before taking the trigger lock.
begin;

do $$
begin
  if exists (
    select 1
    from public.menu_item_tech_card_components component
    join public.menu_items item on item.id = component.component_menu_item_id
    where coalesce(item.sale_unit, 'piece') = 'piece'
      and component.quantity <> trunc(component.quantity)
  ) then
    raise exception 'Existing piece-based Tech Card components must have whole quantities before applying migration 151';
  end if;
end;
$$;

commit;

begin;

create or replace function public.validate_tech_card_component_quantity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  component_sale_unit text;
begin
  select coalesce(item.sale_unit, 'piece')
  into component_sale_unit
  from public.menu_items item
  where item.id = new.component_menu_item_id;

  if component_sale_unit = 'piece' and new.quantity <> trunc(new.quantity) then
    raise exception 'Piece-based included menu items require a whole quantity';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_tech_card_component_quantity()
  from public, anon, authenticated;

drop trigger if exists tech_card_components_validate_quantity
  on public.menu_item_tech_card_components;
create trigger tech_card_components_validate_quantity
before insert or update of component_menu_item_id, quantity
on public.menu_item_tech_card_components
for each row execute function public.validate_tech_card_component_quantity();

commit;

notify pgrst, 'reload schema';
