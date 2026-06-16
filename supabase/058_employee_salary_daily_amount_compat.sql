alter table public.employee_salary_rates
  add column if not exists daily_amount integer;

update public.employee_salary_rates
set daily_amount = coalesce(daily_amount, amount)
where daily_amount is null;

alter table public.employee_salary_rates
  alter column daily_amount set default 0;

alter table public.employee_salary_rates
  alter column daily_amount drop not null;
