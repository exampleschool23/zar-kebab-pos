-- Average daily meal cost per present employee. This supports current
-- operating estimates and never rewrites historical expense records.

alter table public.business_settings
  add column if not exists average_daily_employee_meal_uzs bigint not null default 0
    check (average_daily_employee_meal_uzs >= 0);

notify pgrst, 'reload schema';
