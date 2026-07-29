-- Zar Kebab POS — breakfast menu from the supplied poster.
-- Run once in Supabase Dashboard → SQL Editor.
--
-- The poster shows a price of 15 for every dish. Zar Kebab stores prices in
-- UZS, so these products are configured as 15,000 UZS.
--
-- IMPORTANT: Review the four real costs below before running this script.
-- They are protected accounting values used for profit reporting.

begin;

insert into public.menu_categories (
  id,
  name_uz,
  name_ru,
  name_en,
  image_url,
  hidden,
  waiter_hidden,
  sort_order
) values (
  'breakfast',
  'Nonushta',
  'Завтраки',
  'Breakfast',
  '',
  false,
  false,
  9
)
on conflict (id) do update set
  name_uz = excluded.name_uz,
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  hidden = false,
  waiter_hidden = false;

insert into public.menu_items (
  id,
  category_id,
  name_uz,
  name_ru,
  name_en,
  description_uz,
  description_ru,
  description_en,
  price,
  image_url,
  available,
  cashier_only,
  public_hidden,
  waiter_hidden,
  sort_order
) values
  (
    'zk_english_breakfast',
    'breakfast',
    'Inglizcha nonushta',
    'Английский завтрак',
    'English Breakfast',
    'Tuxum, kolbasa, loviya, qo''ziqorin va ko''katlardan iborat to''yimli nonushta.',
    'Сытный завтрак с яичницей, сосисками, фасолью, грибами и зеленью.',
    'A hearty breakfast with fried eggs, sausages, beans, mushrooms, and herbs.',
    15000,
    '',
    true,
    false,
    false,
    false,
    1
  ),
  (
    'zk_shakshuka',
    'breakfast',
    'Shakshuka',
    'Шакшука',
    'Shakshuka',
    'To''yingan pomidor sousidagi tuxum, ko''kat va ziravorlar bilan.',
    'Яйца в насыщенном томатном соусе с зеленью и пряной подачей.',
    'Eggs in a rich tomato sauce, served with herbs and spices.',
    15000,
    '',
    true,
    false,
    false,
    false,
    2
  ),
  (
    'zk_cottage_cheese_crepes',
    'breakfast',
    'Tvorogli blinchiklar',
    'Блинчики с творогом',
    'Cottage Cheese Crepes',
    'Tvorog solingan klassik blinchiklar.',
    'Классические блинчики с творогом.',
    'Classic crepes filled with cottage cheese.',
    15000,
    '',
    true,
    false,
    false,
    false,
    3
  ),
  (
    'zk_syrniki',
    'breakfast',
    'Sirniklar',
    'Сырники',
    'Syrniki',
    'Rikottadan tayyorlangan mayin, tillarang sirniklar, yangi yalpiz bilan.',
    'Нежные румяные сырники из рикотты с лёгкой подачей и свежей мятой.',
    'Tender golden ricotta pancakes, lightly served with fresh mint.',
    15000,
    '',
    true,
    false,
    false,
    false,
    4
  )
on conflict (id) do update set
  category_id = excluded.category_id,
  name_uz = excluded.name_uz,
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  description_uz = excluded.description_uz,
  description_ru = excluded.description_ru,
  description_en = excluded.description_en,
  price = excluded.price,
  available = true,
  cashier_only = false,
  public_hidden = false,
  waiter_hidden = false,
  sort_order = excluded.sort_order,
  deleted_at = null;

-- Protected real costs (UZS). Replace these estimates with the cafe's actual
-- recipe costs before running if exact profit reporting is required.
insert into public.menu_item_costs (
  menu_item_id,
  cost_price,
  variant_costs,
  updated_at
) values
  ('zk_english_breakfast',       9000, '{}'::jsonb, now()),
  ('zk_shakshuka',               7000, '{}'::jsonb, now()),
  ('zk_cottage_cheese_crepes',   6500, '{}'::jsonb, now()),
  ('zk_syrniki',                 7000, '{}'::jsonb, now())
on conflict (menu_item_id) do update set
  cost_price = excluded.cost_price,
  updated_at = now();

commit;
