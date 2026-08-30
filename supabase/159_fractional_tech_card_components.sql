-- Included dishes are recipe portions, not only whole shelf units. Allow values
-- such as 0.3 and 0.5 so their protected cost is included proportionally.
-- Existing stock settlement already ignores non-whole piece movements instead
-- of rounding them and continues deducting whole snapshotted components once.

begin;

drop trigger if exists tech_card_components_validate_quantity
  on public.menu_item_tech_card_components;

drop function if exists public.validate_tech_card_component_quantity();

commit;

notify pgrst, 'reload schema';
