-- Zar Kebab POS — polished starter cafe menu expansion.
-- Run after 014_seed_cashier_quick_items.sql.
--
-- This keeps the original core menu and adds a fuller cafe-style offer:
-- grill signatures, combo sets, sides, desserts, and richer drinks.

insert into public.menu_categories (id, name_uz, name_ru, name_en, image_url, sort_order) values
  ('combos',   'Setlar',       'Комбо-сеты', 'Combo Sets', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&q=80', 2),
  ('sides',    'Garnirlar',    'Гарниры',    'Sides',      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&q=80', 7),
  ('desserts', 'Shirinliklar', 'Десерты',    'Desserts',   'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=200&q=80', 8)
on conflict (id) do nothing;

insert into public.menu_items
  (id, category_id, name_uz, name_ru, name_en, description_uz, description_ru, description_en, price, image_url, available, sort_order)
values
  ('zk_lamb_ribs', 'kebab', 'Qo''y qovurg''a', 'Бараньи ребрышки', 'Lamb ribs', 'Mangalda pishgan qovurg''a, piyoz va ko''kat bilan', 'Ребрышки на мангале с луком и зеленью', 'Grilled lamb ribs with onion and herbs', 42000, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80', true, 15),
  ('zk_chicken_wings', 'kebab', 'Tovuq qanotlari', 'Куриные крылышки', 'Chicken wings', 'Marinadlangan qanotlar, yengil achchiq ta''m', 'Маринованные крылышки с легкой остротой', 'Marinated wings with a gentle spicy kick', 28000, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80', true, 16),
  ('zk_liver_shashlik', 'kebab', 'Jigar shashlik', 'Шашлык из печени', 'Liver shashlik', 'Mayin jigar shashlik, piyoz bilan', 'Нежный шашлык из печени с луком', 'Tender liver shashlik with onion', 23000, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80', true, 17),
  ('zk_veg_shashlik', 'kebab', 'Sabzavot shashlik', 'Овощной шашлык', 'Vegetable shashlik', 'Mangalda qizargan mavsumiy sabzavotlar', 'Овощи на мангале', 'Grilled seasonal vegetables on skewers', 18000, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80', true, 18),
  ('zk_mixed_grill', 'kebab', 'Assorti grill', 'Гриль ассорти', 'Mixed grill plate', 'Mol, tovuq, lula va sabzavotlardan katta likopcha', 'Большое ассорти из говядины, курицы, люля и овощей', 'A generous plate of beef, chicken, lula, and vegetables', 155000, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80', true, 19),

  ('zk_lunch_kebab_set', 'combos', 'Tushlik kebab set', 'Обеденный кебаб-сет', 'Lunch kebab set', 'Shashlik, salat, non va choy', 'Шашлык, салат, лепешка и чай', 'Shashlik, salad, flatbread, and tea', 59000, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80', true, 20),
  ('zk_student_set', 'combos', 'Student set', 'Студенческий сет', 'Student set', 'Lula kebab, fri va ichimlik', 'Люля-кебаб, фри и напиток', 'Lula kebab, fries, and a drink', 45000, 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&q=80', true, 21),
  ('zk_family_grill_set', 'combos', 'Oilaviy grill set', 'Семейный гриль-сет', 'Family grill set', '4 kishilik shashlik assorti, salat va non', 'Ассорти шашлыков на 4 персоны, салат и лепешка', 'Mixed shashlik for 4 people with salad and flatbread', 285000, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80', true, 22),
  ('zk_takeaway_box', 'combos', 'Olib ketish kebab box', 'Кебаб-бокс с собой', 'Take away kebab box', 'Shashlik, garnir va sous bilan qulay box', 'Удобный бокс с шашлыком, гарниром и соусом', 'A convenient box with shashlik, side, and sauce', 52000, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80', true, 23),

  ('zk_shorva', 'first', 'Sho''rva', 'Шурпа', 'Shorva', 'Mol go''shti, kartoshka va sabzavotli to''yimli sho''rva', 'Сытная шурпа с говядиной, картофелем и овощами', 'Hearty beef soup with potatoes and vegetables', 30000, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&q=80', true, 24),
  ('zk_mastava', 'first', 'Mastava', 'Мастава', 'Mastava', 'Guruchli, sabzavotli va go''shtli milliy sho''rva', 'Национальный суп с рисом, овощами и мясом', 'Traditional rice soup with vegetables and meat', 28000, 'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&q=80', true, 25),

  ('zk_plov', 'main', 'Osh', 'Плов', 'Plov', 'Sabzi, guruch va mayin go''shtdan klassik osh', 'Классический плов с морковью, рисом и нежным мясом', 'Classic plov with carrots, rice, and tender meat', 38000, 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80', true, 26),
  ('zk_qurutob', 'main', 'Qurutob', 'Курутоб', 'Qurutob', 'Qurut, non, ko''kat va sabzavotli yengil taom', 'Курут, лепешка, зелень и овощи', 'A light dish with qurut, flatbread, herbs, and vegetables', 34000, 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80', true, 27),
  ('zk_chicken_rice', 'main', 'Tovuqli guruch', 'Курица с рисом', 'Chicken with rice', 'Qovurilgan tovuq va xushbo''y guruch', 'Жареная курица с ароматным рисом', 'Roasted chicken with fragrant rice', 36000, 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80', true, 28),
  ('zk_kazan_kebab', 'main', 'Qozon kabob', 'Казан-кебаб', 'Kazan kebab', 'Qozonda pishgan go''sht va kartoshka', 'Мясо и картофель, приготовленные в казане', 'Cauldron-cooked meat and potatoes', 52000, 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80', true, 29),

  ('zk_garden_salad', 'salads', 'Fresh salat', 'Свежий салат', 'Fresh garden salad', 'Bodring, pomidor, ko''kat va limonli sous', 'Огурцы, помидоры, зелень и лимонная заправка', 'Cucumber, tomato, herbs, and lemon dressing', 18000, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80', true, 30),
  ('zk_suzma_salad', 'salads', 'Suzma salat', 'Салат с сюзьмой', 'Suzma salad', 'Suzma, bodring va ko''katli salqin salat', 'Освежающий салат с сюзьмой, огурцами и зеленью', 'Refreshing suzma, cucumber, and herb salad', 19000, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80', true, 31),
  ('zk_spicy_carrot', 'salads', 'Achchiq sabzi', 'Острая морковь', 'Spicy carrot salad', 'Koreyscha uslubdagi achchiq sabzi', 'Острая морковь по-корейски', 'Korean-style spicy carrot salad', 14000, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80', true, 32),

  ('zk_fries', 'sides', 'Fri kartoshka', 'Картофель фри', 'French fries', 'Qarsildoq fri kartoshka', 'Хрустящий картофель фри', 'Crispy French fries', 16000, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80', true, 33),
  ('zk_rice_side', 'sides', 'Guruch', 'Рис', 'Rice', 'Xushbo''y oq guruch', 'Ароматный белый рис', 'Fragrant white rice', 12000, 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80', true, 34),
  ('zk_grilled_veg_side', 'sides', 'Grill sabzavot', 'Овощи гриль', 'Grilled vegetables', 'Mangalda pishgan sabzavotlar', 'Овощи, приготовленные на мангале', 'Vegetables cooked over the grill', 22000, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80', true, 35),
  ('zk_pickles', 'sides', 'Tuzlama assorti', 'Ассорти солений', 'Pickles plate', 'Tuzlangan bodring, pomidor va karam', 'Соленые огурцы, помидоры и капуста', 'Pickled cucumber, tomato, and cabbage', 15000, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80', true, 36),

  ('zk_ayran', 'drinks', 'Ayran', 'Айран', 'Ayran', 'Salqin yogurtli ichimlik', 'Освежающий кисломолочный напиток', 'Refreshing yogurt drink', 10000, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80', true, 37),
  ('zk_compote', 'drinks', 'Kompot', 'Компот', 'Compote', 'Uy sharoitida tayyorlangan mevali kompot', 'Домашний фруктовый компот', 'Homemade fruit compote', 12000, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=80', true, 38),
  ('zk_lemonade', 'drinks', 'Limonad', 'Лимонад', 'Fresh lemonade', 'Limon va yalpizli salqin ichimlik', 'Освежающий лимонад с мятой', 'Refreshing lemon and mint drink', 18000, 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80', true, 39),

  ('zk_chak_chak', 'desserts', 'Chak-chak', 'Чак-чак', 'Chak-chak', 'Asal bilan tayyorlangan milliy shirinlik', 'Национальный десерт с медом', 'Traditional honey dessert', 18000, 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80', true, 40),
  ('zk_honey_cake', 'desserts', 'Medovik', 'Медовик', 'Honey cake', 'Yumshoq asal torti', 'Нежный медовый торт', 'Soft layered honey cake', 24000, 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80', true, 41),
  ('zk_baklava', 'desserts', 'Baklava', 'Пахлава', 'Baklava', 'Yong''oqli va asalli qatlama shirinlik', 'Слоеный десерт с орехами и медом', 'Layered pastry with nuts and honey', 22000, 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80', true, 42),
  ('zk_ice_cream', 'desserts', 'Muzqaymoq', 'Мороженое', 'Ice cream', 'Vanilli muzqaymoq, sous bilan', 'Ванильное мороженое с соусом', 'Vanilla ice cream with sauce', 16000, 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80', true, 43)
on conflict (id) do nothing;
