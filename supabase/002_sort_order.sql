-- Add sort_order to menu_items and menu_categories
-- Run in Supabase SQL Editor if you later persist menu data in Supabase

alter table menu_items
  add column if not exists sort_order integer not null default 0;

alter table menu_categories
  add column if not exists sort_order integer not null default 0;

-- Give existing menu_categories sequential sort_order values
with ranked as (
  select id, row_number() over (order by created_at asc) as rn
  from menu_categories
)
update menu_categories
set sort_order = ranked.rn
from ranked
where menu_categories.id = ranked.id
  and menu_categories.sort_order = 0;

-- Give existing menu_items sequential sort_order values
with ranked as (
  select id, row_number() over (order by created_at asc) as rn
  from menu_items
)
update menu_items
set sort_order = ranked.rn
from ranked
where menu_items.id = ranked.id
  and menu_items.sort_order = 0;
