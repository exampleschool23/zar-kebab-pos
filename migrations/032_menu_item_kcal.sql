-- Add calories per menu item for public menus and staff ordering screens.

alter table public.menu_items
  add column if not exists kcal integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_kcal_nonnegative'
  ) then
    alter table public.menu_items
      add constraint menu_items_kcal_nonnegative check (kcal >= 0) not valid;
  end if;
end $$;

update public.menu_items as item
set kcal = fixed.kcal
from (
  values
    ('m1', 980), ('m2', 360), ('m3', 420), ('m4', 330),
    ('m5', 520), ('m6', 460), ('m7', 610), ('m8', 340),
    ('m9', 120), ('m10', 260), ('m11', 0), ('m12', 210),
    ('m13', 180), ('m14', 260),
    ('zk_lamb_ribs', 720), ('zk_chicken_wings', 540),
    ('zk_liver_shashlik', 390), ('zk_veg_shashlik', 180),
    ('zk_mixed_grill', 1650), ('zk_lunch_kebab_set', 820),
    ('zk_student_set', 760), ('zk_family_grill_set', 3200),
    ('zk_takeaway_box', 880), ('zk_shorva', 430), ('zk_mastava', 460),
    ('zk_plov', 760), ('zk_qurutob', 520), ('zk_chicken_rice', 690),
    ('zk_kazan_kebab', 850), ('zk_garden_salad', 150),
    ('zk_suzma_salad', 220), ('zk_spicy_carrot', 140),
    ('zk_fries', 430), ('zk_rice_side', 260),
    ('zk_grilled_veg_side', 170), ('zk_pickles', 80),
    ('zk_ayran', 90), ('zk_compote', 160), ('zk_lemonade', 140),
    ('zk_chak_chak', 420), ('zk_honey_cake', 520),
    ('zk_baklava', 480), ('zk_ice_cream', 260),
    ('qi_water_05', 0), ('qi_fanta_05', 230), ('qi_orbit', 45),
    ('qi_chupa_chups', 60), ('qi_lays', 520)
) as fixed(id, kcal)
where item.id = fixed.id;
