-- ============================================================
-- Table management metadata
-- Adds zones, capacity, active/disabled state, and ordering.
-- ============================================================

create table if not exists public.table_zones (
  id         text        primary key,
  name       text        not null unique,
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_tables
  add column if not exists zone_id text references public.table_zones(id) on delete set null,
  add column if not exists zone_name text not null default 'Main Hall',
  add column if not exists capacity integer not null default 4 check (capacity > 0),
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

insert into public.table_zones (id, name, sort_order, is_active) values
  ('main-hall',    'Main Hall',    1, true),
  ('vip',          'VIP',          2, true),
  ('outdoor',      'Outdoor',      3, true),
  ('second-floor', 'Second Floor', 4, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

update public.restaurant_tables
set
  zone_id = case
    when lower(name) like 'vip%' then 'vip'
    else coalesce(zone_id, 'main-hall')
  end,
  zone_name = case
    when lower(name) like 'vip%' then 'VIP'
    else coalesce(nullif(zone_name, ''), 'Main Hall')
  end,
  capacity = case
    when lower(name) like 'vip%' then greatest(capacity, 6)
    else capacity
  end,
  sort_order = case
    when sort_order = 0 then row_number_value.rn
    else sort_order
  end,
  updated_at = now()
from (
  select id, row_number() over (order by created_at, id) as rn
  from public.restaurant_tables
) as row_number_value
where public.restaurant_tables.id = row_number_value.id;

alter table public.table_zones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='table_zones' and policyname='staff_all_table_zones') then
    create policy staff_all_table_zones on public.table_zones
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'table_zones'
  ) then
    alter publication supabase_realtime add table public.table_zones;
  end if;
end $$;
