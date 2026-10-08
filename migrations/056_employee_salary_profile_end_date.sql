-- Let salary profiles be deactivated without losing historical accrual windows.

alter table public.employee_salary_profiles
  add column if not exists ended_at date;

create index if not exists idx_employee_salary_profiles_is_active
  on public.employee_salary_profiles(is_active, employee_name);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_salary_profiles_ended_at_after_joined_at'
  ) then
    alter table public.employee_salary_profiles
      add constraint employee_salary_profiles_ended_at_after_joined_at
      check (ended_at is null or ended_at >= joined_at) not valid;
  end if;
end $$;

alter table public.employee_salary_profiles
  validate constraint employee_salary_profiles_ended_at_after_joined_at;
