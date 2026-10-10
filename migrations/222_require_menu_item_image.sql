-- Every new menu product must be created with a cover image. Existing products
-- without media stay untouched; only inserts are checked.
begin;

create or replace function public.require_menu_item_image_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(btrim(new.image_url), '') = '' then
    raise exception 'menu_item_image_required'
      using errcode = '23514',
            hint = 'Add a product image before creating the menu item.';
  end if;
  return new;
end;
$$;

drop trigger if exists menu_items_require_image_on_insert on public.menu_items;
create trigger menu_items_require_image_on_insert
  before insert on public.menu_items
  for each row execute function public.require_menu_item_image_on_insert();

commit;
