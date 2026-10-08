-- Job function describes employment duties; it never grants app permissions.
-- Existing employees remain unassigned until explicitly classified.
alter table public.employee_salary_profiles
  add column if not exists job_function text
  constraint employee_salary_profiles_job_function_check
  check (job_function in ('waiter', 'manager', 'cook', 'washer', 'cleaner', 'hostess', 'chef_cook'));

notify pgrst, 'reload schema';
