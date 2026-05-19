-- ============================================================
-- Zar Kebab POS — Starter cashier quick items
-- Run after 013_cashier_quick_items.sql.
--
-- Quick-only packaged products are stored as menu_items with:
--   available = false
--   show_in_cashier_quick_items = true
-- This keeps them out of public/table menu browsing while still
-- allowing cashiers to add them from the payment screen.
-- ============================================================

update public.menu_items
set
  show_in_cashier_quick_items = true,
  send_to_kitchen = false,
  quick_item_sort_order = 1
where id = 'm12';

insert into public.menu_items
  (
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
    sort_order,
    show_in_cashier_quick_items,
    send_to_kitchen,
    quick_item_sort_order
  )
values
  (
    'qi_water_05',
    'drinks',
    'Suv 0.5L',
    'Вода 0.5L',
    'Water 0.5L',
    'Gazsiz suv',
    'Вода без газа',
    'Still water',
    5000,
    'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=400&q=80',
    false,
    101,
    true,
    false,
    2
  ),
  (
    'qi_fanta_05',
    'drinks',
    'Fanta 0.5L',
    'Fanta 0.5L',
    'Fanta 0.5L',
    '0.5L ichimlik',
    '0.5L напиток',
    '0.5L drink',
    12000,
    'https://images.unsplash.com/photo-1624517452488-04869289c4ca?w=400&q=80',
    false,
    102,
    true,
    false,
    3
  ),
  (
    'qi_orbit',
    'drinks',
    'Orbit',
    'Orbit',
    'Orbit',
    'Saqich',
    'Жевательная резинка',
    'Chewing gum',
    8000,
    '',
    false,
    103,
    true,
    false,
    4
  ),
  (
    'qi_chupa_chups',
    'drinks',
    'Chupa Chups',
    'Chupa Chups',
    'Chupa Chups',
    'Konfet',
    'Леденец',
    'Lollipop',
    5000,
    '',
    false,
    104,
    true,
    false,
    5
  ),
  (
    'qi_lays',
    'drinks',
    'Lays',
    'Lays',
    'Lays',
    'Chips',
    'Чипсы',
    'Chips',
    15000,
    '',
    false,
    105,
    true,
    false,
    6
  )
on conflict (id) do update
set
  name_uz = excluded.name_uz,
  name_ru = excluded.name_ru,
  name_en = excluded.name_en,
  description_uz = excluded.description_uz,
  description_ru = excluded.description_ru,
  description_en = excluded.description_en,
  price = excluded.price,
  image_url = excluded.image_url,
  available = excluded.available,
  show_in_cashier_quick_items = excluded.show_in_cashier_quick_items,
  send_to_kitchen = excluded.send_to_kitchen,
  quick_item_sort_order = excluded.quick_item_sort_order;
