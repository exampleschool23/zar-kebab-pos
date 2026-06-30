-- ============================================================
-- Zar Kebab POS — Monthly rent business setting
-- Stores expected rent in UZS for accounting estimates.
-- ============================================================

alter table public.business_settings
  add column if not exists monthly_rent_uzs bigint not null default 0
    check (monthly_rent_uzs >= 0);

update public.business_settings
set monthly_rent_uzs = 0
where id = 'default'
  and monthly_rent_uzs is null;
