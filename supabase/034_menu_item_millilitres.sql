-- Add serving volume in millilitres per menu item for drinks and packaged items.

alter table public.menu_items
  add column if not exists millilitres integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_millilitres_nonnegative'
  ) then
    alter table public.menu_items
      add constraint menu_items_millilitres_nonnegative check (millilitres >= 0) not valid;
  end if;
end $$;

update public.menu_items as item
set
  millilitres = fixed.millilitres,
  grams = case when fixed.millilitres > 0 then 0 else item.grams end
from (
  values
    ('m11', 350), ('m12', 500), ('m13', 250),
    ('zk_ayran', 300), ('zk_compote', 300), ('zk_lemonade', 350),
    ('qi_water_05', 500), ('qi_fanta_05', 500)
) as fixed(id, millilitres)
where item.id = fixed.id;
