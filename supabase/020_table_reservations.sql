-- ============================================================
-- Table reservations
-- Adds reserved state and reservation details to restaurant tables.
-- ============================================================

alter table public.restaurant_tables
  drop constraint if exists restaurant_tables_status_check;

alter table public.restaurant_tables
  add constraint restaurant_tables_status_check
  check (status in ('available', 'reserved', 'occupied', 'needs_bill'));

alter table public.restaurant_tables
  add column if not exists reserved_for_name text not null default '',
  add column if not exists reserved_for_phone text not null default '',
  add column if not exists reserved_at timestamptz,
  add column if not exists reserved_until timestamptz,
  add column if not exists reservation_notes text not null default '';

update public.restaurant_tables
set
  reserved_for_name = coalesce(reserved_for_name, ''),
  reserved_for_phone = coalesce(reserved_for_phone, ''),
  reservation_notes = coalesce(reservation_notes, ''),
  updated_at = now();
