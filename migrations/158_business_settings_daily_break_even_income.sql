-- Configurable average daily break-even income target for the Dashboard chart.

alter table public.business_settings
  add column if not exists average_daily_break_even_income_uzs bigint not null default 10000000
    check (average_daily_break_even_income_uzs >= 0);

notify pgrst, 'reload schema';
