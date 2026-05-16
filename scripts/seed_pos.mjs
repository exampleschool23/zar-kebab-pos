import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'

const SUPABASE_URL = 'https://bcdbljpwhyawaasimjmk.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjZGJsanB3aHlhd2Fhc2ltam1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjYxODUsImV4cCI6MjA5NDQ0MjE4NX0.zUpXmrJ9ossyyCBN0XBRzAMPqJfKJtXnq_gyjNpV9u8'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const categories = [
  { id: 'kebab',  name_uz: 'KEBAB',           name_ru: 'КЕБАБ',          name_en: 'KEBAB',       image_url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&q=80', sort_order: 1 },
  { id: 'main',   name_uz: 'Asosiy taomlar',  name_ru: 'Основные блюда', name_en: 'Main Dishes', image_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&q=80', sort_order: 2 },
  { id: 'first',  name_uz: 'Birinchi taom',   name_ru: 'Первые блюда',   name_en: 'First Meal',  image_url: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=200&q=80', sort_order: 3 },
  { id: 'salads', name_uz: 'Salatlar',        name_ru: 'Салаты',         name_en: 'Salads',      image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&q=80', sort_order: 4 },
  { id: 'drinks', name_uz: 'Ichimliklar',     name_ru: 'Напитки',        name_en: 'Drinks',      image_url: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=200&q=80', sort_order: 5 },
  { id: 'bread',  name_uz: 'Non',             name_ru: 'Хлеб',           name_en: 'Bread',       image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&q=80', sort_order: 6 },
]

const menuItems = [
  { id: 'm1',  category_id: 'kebab',  name_uz: 'ZAR KEBAB',            name_ru: 'ZAR KEBAB',             name_en: 'ZAR KEBAB',          description_uz: 'Maxsus ZAR kebab',            description_ru: 'Фирменный ZAR кебаб',           description_en: 'Our signature ZAR kebab',           price:  80000, image_url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80', available: true, sort_order:  1 },
  { id: 'm2',  category_id: 'kebab',  name_uz: 'Lula kebab',            name_ru: 'Люля-кебаб',            name_en: 'Lula kebab',         description_uz: "Mol go'shtidan",              description_ru: 'Из говядины',                   description_en: 'Beef minced kebab',                 price:  24000, image_url: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&q=80', available: true, sort_order:  2 },
  { id: 'm3',  category_id: 'kebab',  name_uz: "Shashlik mol go'shti", name_ru: 'Шашлык из говядины',    name_en: 'Shashlik beef',      description_uz: "Mol go'shtidan shashlik",    description_ru: 'Шашлык из говядины на мангале', description_en: 'Beef shashlik on the grill',        price:  25000, image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80', available: true, sort_order:  3 },
  { id: 'm4',  category_id: 'kebab',  name_uz: 'Shashlik tovuq',        name_ru: 'Шашлык из курицы',      name_en: 'Shashlik chicken',   description_uz: "Tovuq go'shtidan shashlik",  description_ru: 'Шашлык из курицы',              description_en: 'Chicken shashlik',                  price:  22000, image_url: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80', available: true, sort_order:  4 },
  { id: 'm5',  category_id: 'main',   name_uz: 'Chiroqchi',             name_ru: 'Чироқчи',               name_en: 'Chiroqchi',          description_uz: 'Maxsus chiroqchi taomi',      description_ru: 'Фирменное блюдо Чироқчи',       description_en: 'Special Chiroqchi dish',            price:  17000, image_url: 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80', available: true, sort_order:  5 },
  { id: 'm6',  category_id: 'main',   name_uz: "Do'lma",                name_ru: 'Долма',                 name_en: 'Dolma',              description_uz: "An'anaviy do'lma",            description_ru: 'Традиционная долма',             description_en: 'Traditional dolma',                 price:  25000, image_url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80', available: true, sort_order:  6 },
  { id: 'm7',  category_id: 'first',  name_uz: "Lag'mon",               name_ru: 'Лагман',                name_en: 'Lagman',             description_uz: "Uyda tayyorlangan lag'mon",  description_ru: 'Домашний лагман',               description_en: 'Homemade lagman noodle soup',       price:  32000, image_url: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80', available: true, sort_order:  7 },
  { id: 'm8',  category_id: 'first',  name_uz: 'Chechevitsa',           name_ru: 'Чечевица',              name_en: 'Lentil Soup',        description_uz: "Yasmiq sho'rva",              description_ru: 'Суп из чечевицы',               description_en: 'Traditional lentil soup',           price:  25000, image_url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&q=80', available: true, sort_order:  8 },
  { id: 'm9',  category_id: 'salads', name_uz: 'Achichuk salat',        name_ru: 'Салат Ачичук',          name_en: 'Achichuk salad',     description_uz: 'Pomidor va piyozdan',         description_ru: 'Из помидоров и лука',           description_en: 'Tomato and onion salad',            price:  15000, image_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80', available: true, sort_order:  9 },
  { id: 'm10', category_id: 'salads', name_uz: 'Yapon salati',          name_ru: 'Японский салат',        name_en: 'Japanese salad',     description_uz: 'Yapon uslubidagi salat',      description_ru: 'Салат в японском стиле',        description_en: 'Japanese style salad',              price:  25000, image_url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80', available: true, sort_order: 10 },
  { id: 'm11', category_id: 'drinks', name_uz: 'Choy',                  name_ru: 'Чай',                   name_en: 'Tea',                description_uz: 'Issiq choy',                  description_ru: 'Горячий чай',                   description_en: 'Hot tea',                           price:   8000, image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80', available: true, sort_order: 11 },
  { id: 'm12', category_id: 'drinks', name_uz: 'Coca-Cola 0.5L',        name_ru: 'Кока-Кола 0.5L',        name_en: 'Coca-Cola 0.5L',     description_uz: '0.5L shisha',                 description_ru: '0.5L бутылка',                  description_en: '0.5L bottle',                       price:  12000, image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=80', available: true, sort_order: 12 },
  { id: 'm13', category_id: 'drinks', name_uz: 'Sok',                   name_ru: 'Сок',                   name_en: 'Juice',              description_uz: 'Tabiiy meva sharbati',        description_ru: 'Натуральный фруктовый сок',     description_en: 'Natural fruit juice',               price:  20000, image_url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=80', available: true, sort_order: 13 },
  { id: 'm14', category_id: 'bread',  name_uz: 'Non',                   name_ru: 'Лепёшка',               name_en: 'Flatbread',          description_uz: 'Tandirda pishirilgan non',    description_ru: 'Лепёшка из тандыра',            description_en: 'Freshly baked tandoor flatbread',   price:   5000, image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80', available: true, sort_order: 14 },
]

const tables = [
  { id: 't1',   name: 'Table 1',   status: 'available' },
  { id: 't2',   name: 'Table 2',   status: 'available' },
  { id: 't3',   name: 'Table 3',   status: 'available' },
  { id: 't4',   name: 'Table 4',   status: 'available' },
  { id: 't5',   name: 'Table 5',   status: 'available' },
  { id: 't6',   name: 'Table 6',   status: 'available' },
  { id: 't7',   name: 'Table 7',   status: 'available' },
  { id: 't8',   name: 'Table 8',   status: 'available' },
  { id: 't9',   name: 'Table 9',   status: 'available' },
  { id: 't10',  name: 'Table 10',  status: 'available' },
  { id: 'vip1', name: 'VIP 1',     status: 'available' },
  { id: 'vip2', name: 'VIP 2',     status: 'available' },
]

async function seed() {
  console.log('Seeding categories...')
  const { error: catErr } = await supabase
    .from('menu_categories')
    .upsert(categories, { onConflict: 'id' })
  if (catErr) { console.error('categories:', catErr.message); process.exit(1) }
  console.log(`  ✓ ${categories.length} categories`)

  console.log('Seeding menu items...')
  const { error: itemErr } = await supabase
    .from('menu_items')
    .upsert(menuItems, { onConflict: 'id' })
  if (itemErr) { console.error('menu_items:', itemErr.message); process.exit(1) }
  console.log(`  ✓ ${menuItems.length} menu items`)

  console.log('Seeding tables...')
  const { error: tableErr } = await supabase
    .from('restaurant_tables')
    .upsert(tables, { onConflict: 'id' })
  if (tableErr) { console.error('restaurant_tables:', tableErr.message); process.exit(1) }
  console.log(`  ✓ ${tables.length} tables`)

  console.log('\nDone! All seed data is in Supabase.')
}

seed()
