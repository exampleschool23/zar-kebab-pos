-- Upgrade older salary-rate installs that still use daily_amount.
-- This preserves historical salary rows while enabling explicit daily/monthly units.

alter table public.employee_salary_rates
  add column if not exists amount integer;

alter table public.employee_salary_rates
  add column if not exists rate_unit text;

update public.employee_salary_rates
set amount = coalesce(amount, daily_amount)
where amount is null;

update public.employee_salary_rates
set rate_unit = coalesce(nullif(rate_unit, ''), 'daily')
where rate_unit is null or rate_unit = '';

alter table public.employee_salary_rates
  alter column rate_unit set default 'daily';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_salary_rates_amount_check'
  ) then
    alter table public.employee_salary_rates
      add constraint employee_salary_rates_amount_check
      check (amount > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_salary_rates_rate_unit_check'
  ) then
    alter table public.employee_salary_rates
      add constraint employee_salary_rates_rate_unit_check
      check (rate_unit in ('daily', 'monthly')) not valid;
  end if;
end $$;

alter table public.employee_salary_rates
  validate constraint employee_salary_rates_amount_check;

alter table public.employee_salary_rates
  validate constraint employee_salary_rates_rate_unit_check;

alter table public.employee_salary_rates
  alter column amount set not null;

alter table public.employee_salary_rates
  alter column rate_unit set not null;
