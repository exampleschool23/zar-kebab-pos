alter table if exists public.employee_salary_profiles
  alter column profile_id drop not null;

alter table if exists public.employee_salary_profiles
  drop constraint if exists employee_salary_profiles_profile_id_key;

drop index if exists public.idx_employee_salary_profiles_profile_id_unique;

create unique index if not exists idx_employee_salary_profiles_profile_id_unique
  on public.employee_salary_profiles(profile_id)
  where profile_id is not null;

alter table if exists public.employee_salary_profiles
  drop constraint if exists employee_salary_profiles_profile_id_fkey;

alter table if exists public.employee_salary_profiles
  add constraint employee_salary_profiles_profile_id_fkey
  foreign key (profile_id)
  references public.profiles(id)
  on delete set null;
