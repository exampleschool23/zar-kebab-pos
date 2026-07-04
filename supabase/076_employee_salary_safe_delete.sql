-- Soft-delete employee salary profiles without deleting salary accounting history.

alter table public.employee_salary_profiles
  add column if not exists deleted_at timestamptz;

create index if not exists idx_employee_salary_profiles_deleted_at
  on public.employee_salary_profiles(deleted_at);
