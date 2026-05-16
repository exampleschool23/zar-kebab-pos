-- ============================================================
-- Zar Kebab POS — Core POS Tables
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Restaurant tables
create table if not exists public.restaurant_tables (
  id         text        primary key,
  name       text        not null,
  status     text        not null default 'available'
             check (status in ('available', 'occupied', 'needs_bill')),
  created_at timestamptz not null default now()
);

-- 2. Menu categories
create table if not exists public.menu_categories (
  id         text        primary key,
  name_uz    text        default '',
  name_ru    text        default '',
  name_en    text        default '',
  image_url  text        default '',
  sort_order integer     not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Menu items
create table if not exists public.menu_items (
  id               text        primary key,
  category_id      text        references public.menu_categories(id) on delete set null,
  name_uz          text        default '',
  name_ru          text        default '',
  name_en          text        default '',
  description_uz   text        default '',
  description_ru   text        default '',
  description_en   text        default '',
  price            integer     not null default 0,
  image_url        text        default '',
  available        boolean     not null default true,
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now()
);

-- 4. Orders
create table if not exists public.orders (
  id                      text        primary key,
  table_id                text        references public.restaurant_tables(id) on delete set null,
  table_name              text        not null default '',
  waiter_name             text        not null default '',
  status                  text        not null default 'sent_to_kitchen',
  payment_status          text        not null default 'unpaid',
  subtotal                integer     not null default 0,
  service_fee             integer     not null default 0,
  total                   integer     not null default 0,
  loyalty_discount_pct    integer     default 0,
  loyalty_discount_amount integer     default 0,
  discounted_subtotal     integer     default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 5. Order items
create table if not exists public.order_items (
  id           uuid        primary key default gen_random_uuid(),
  order_id     text        not null references public.orders(id) on delete cascade,
  menu_item_id text        not null,
  name         text        not null default '',
  price        integer     not null default 0,
  quantity     integer     not null default 1,
  notes        text        default '',
  status       text        not null default 'new'
               check (status in ('new', 'preparing', 'ready', 'served')),
  created_at   timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_orders_table_id    on public.orders(table_id);
create index if not exists idx_orders_status      on public.orders(status, payment_status);
create index if not exists idx_order_items_order  on public.order_items(order_id);
create index if not exists idx_menu_items_cat     on public.menu_items(category_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table public.restaurant_tables enable row level security;
alter table public.menu_categories    enable row level security;
alter table public.menu_items         enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;

-- All authenticated staff can read and write POS data.
-- (Role-based UI restrictions are enforced in the frontend.)
do $$ begin
  -- restaurant_tables
  if not exists (select 1 from pg_policies where tablename='restaurant_tables' and policyname='staff_all_tables') then
    create policy staff_all_tables on public.restaurant_tables
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  -- menu_categories
  if not exists (select 1 from pg_policies where tablename='menu_categories' and policyname='staff_all_categories') then
    create policy staff_all_categories on public.menu_categories
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  -- menu_items
  if not exists (select 1 from pg_policies where tablename='menu_items' and policyname='staff_all_menu_items') then
    create policy staff_all_menu_items on public.menu_items
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  -- orders
  if not exists (select 1 from pg_policies where tablename='orders' and policyname='staff_all_orders') then
    create policy staff_all_orders on public.orders
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
  -- order_items
  if not exists (select 1 from pg_policies where tablename='order_items' and policyname='staff_all_order_items') then
    create policy staff_all_order_items on public.order_items
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enables cross-device live updates (kitchen ↔ waiter ↔ cashier).
-- Wrapped in DO block so re-running the migration never errors on "already member".
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'restaurant_tables'
  ) then
    alter publication supabase_realtime add table public.restaurant_tables;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;

-- ── Seed data ─────────────────────────────────────────────────────────────────

-- Categories (no 'all' — that is a virtual category added in JavaScript)
insert into public.menu_categories (id, name_uz, name_ru, name_en, image_url, sort_order) values
  ('kebab',  'KEBAB',           'КЕБАБ',          'KEBAB',       'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&q=80', 1),
  ('main',   'Asosiy taomlar',  'Основные блюда', 'Main Dishes', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&q=80', 2),
  ('first',  'Birinchi taom',   'Первые блюда',   'First Meal',  'https://images.unsplash.com/photo-1547592180-85f173990554?w=200&q=80', 3),
  ('salads', 'Salatlar',        'Салаты',         'Salads',      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=200&q=80', 4),
  ('drinks', 'Ichimliklar',     'Напитки',        'Drinks',      'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=200&q=80', 5),
  ('bread',  'Non',             'Хлеб',           'Bread',       'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&q=80', 6)
on conflict (id) do nothing;

-- Menu items
insert into public.menu_items
  (id, category_id, name_uz, name_ru, name_en, description_uz, description_ru, description_en, price, image_url, available, sort_order)
values
  ('m1',  'kebab',  'ZAR KEBAB',            'ZAR KEBAB',             'ZAR KEBAB',          'Maxsus ZAR kebab',            'Фирменный ZAR кебаб',           'Our signature ZAR kebab',           80000, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80', true,  1),
  ('m2',  'kebab',  'Lula kebab',            'Люля-кебаб',            'Lula kebab',         'Mol go''shtidan',             'Из говядины',                   'Beef minced kebab',                 24000, 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&q=80', true,  2),
  ('m3',  'kebab',  'Shashlik mol go''shti', 'Шашлык из говядины',    'Shashlik beef',      'Mol go''shtidan shashlik',    'Шашлык из говядины на мангале', 'Beef shashlik on the grill',        25000, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80', true,  3),
  ('m4',  'kebab',  'Shashlik tovuq',        'Шашлык из курицы',      'Shashlik chicken',   'Tovuq go''shtidan shashlik',  'Шашлык из курицы',              'Chicken shashlik',                  22000, 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80', true,  4),
  ('m5',  'main',   'Chiroqchi',             'Чироқчи',               'Chiroqchi',          'Maxsus chiroqchi taomi',      'Фирменное блюдо Чироқчи',       'Special Chiroqchi dish',            17000, 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80', true,  5),
  ('m6',  'main',   'Do''lma',               'Долма',                 'Dolma',              'An''anaviy do''lma',           'Традиционная долма',             'Traditional dolma',                 25000, 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80', true,  6),
  ('m7',  'first',  'Lag''mon',              'Лагман',                'Lagman',             'Uyda tayyorlangan lag''mon',  'Домашний лагман',               'Homemade lagman noodle soup',       32000, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80', true,  7),
  ('m8',  'first',  'Chechevitsa',           'Чечевица',              'Lentil Soup',        'Yasmiq sho''rva',             'Суп из чечевицы',               'Traditional lentil soup',           25000, 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&q=80', true,  8),
  ('m9',  'salads', 'Achichuk salat',        'Салат Ачичук',          'Achichuk salad',     'Pomidor va piyozdan',         'Из помидоров и лука',           'Tomato and onion salad',            15000, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80', true,  9),
  ('m10', 'salads', 'Yapon salati',          'Японский салат',        'Japanese salad',     'Yapon uslubidagi salat',      'Салат в японском стиле',        'Japanese style salad',              25000, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80', true, 10),
  ('m11', 'drinks', 'Choy',                  'Чай',                   'Tea',                'Issiq choy',                  'Горячий чай',                   'Hot tea',                            8000, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80', true, 11),
  ('m12', 'drinks', 'Coca-Cola 0.5L',        'Кока-Кола 0.5L',        'Coca-Cola 0.5L',     '0.5L shisha',                 '0.5L бутылка',                  '0.5L bottle',                       12000, 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=80', true, 12),
  ('m13', 'drinks', 'Sok',                   'Сок',                   'Juice',              'Tabiiy meva sharbati',        'Натуральный фруктовый сок',     'Natural fruit juice',               20000, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=80', true, 13),
  ('m14', 'bread',  'Non',                   'Лепёшка',               'Flatbread',          'Tandirda pishirilgan non',    'Лепёшка из тандыра',            'Freshly baked tandoor flatbread',    5000, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80', true, 14)
on conflict (id) do nothing;

-- Tables (all start available — real status is managed by the app)
insert into public.restaurant_tables (id, name, status) values
  ('t1',   'Table 1',   'available'),
  ('t2',   'Table 2',   'available'),
  ('t3',   'Table 3',   'available'),
  ('t4',   'Table 4',   'available'),
  ('t5',   'Table 5',   'available'),
  ('t6',   'Table 6',   'available'),
  ('t7',   'Table 7',   'available'),
  ('t8',   'Table 8',   'available'),
  ('t9',   'Table 9',   'available'),
  ('t10',  'Table 10',  'available'),
  ('vip1', 'VIP 1',     'available'),
  ('vip2', 'VIP 2',     'available')
on conflict (id) do nothing;
