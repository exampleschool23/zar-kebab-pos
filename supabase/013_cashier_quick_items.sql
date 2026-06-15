-- ============================================================
-- Zar Kebab POS — Cashier Quick / Counter Items
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table public.menu_items
  add column if not exists show_in_cashier_quick_items boolean not null default false;

alter table public.menu_items
  add column if not exists cashier_only boolean not null default false;

alter table public.menu_items
  add column if not exists send_to_kitchen boolean not null default false;

alter table public.menu_items
  add column if not exists quick_item_sort_order integer not null default 0;

create index if not exists idx_menu_items_cashier_quick
  on public.menu_items(show_in_cashier_quick_items, quick_item_sort_order);
