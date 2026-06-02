-- Add serving weight in grams per menu item for public and staff menus.

alter table public.menu_items
  add column if not exists grams integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_grams_nonnegative'
  ) then
    alter table public.menu_items
      add constraint menu_items_grams_nonnegative check (grams >= 0) not valid;
  end if;
end $$;

update public.menu_items as item
set grams = fixed.grams
from (
  values
    ('m1', 450), ('m2', 150), ('m3', 160), ('m4', 160),
    ('m5', 280), ('m6', 250), ('m7', 450), ('m8', 350),
    ('m9', 180), ('m10', 220), ('m11', 350), ('m12', 500),
    ('m13', 250), ('m14', 180),
    ('zk_lamb_ribs', 220), ('zk_chicken_wings', 250),
    ('zk_liver_shashlik', 170), ('zk_veg_shashlik', 180),
    ('zk_mixed_grill', 900), ('zk_lunch_kebab_set', 520),
    ('zk_student_set', 480), ('zk_family_grill_set', 1900),
    ('zk_takeaway_box', 550), ('zk_shorva', 450), ('zk_mastava', 430),
    ('zk_plov', 420), ('zk_qurutob', 380), ('zk_chicken_rice', 430),
    ('zk_kazan_kebab', 430), ('zk_garden_salad', 220),
    ('zk_suzma_salad', 200), ('zk_spicy_carrot', 180),
    ('zk_fries', 180), ('zk_rice_side', 180),
    ('zk_grilled_veg_side', 220), ('zk_pickles', 160),
    ('zk_ayran', 300), ('zk_compote', 300), ('zk_lemonade', 350),
    ('zk_chak_chak', 120), ('zk_honey_cake', 140),
    ('zk_baklava', 120), ('zk_ice_cream', 120),
    ('qi_water_05', 500), ('qi_fanta_05', 500), ('qi_orbit', 14),
    ('qi_chupa_chups', 12), ('qi_lays', 90)
) as fixed(id, grams)
where item.id = fixed.id;
