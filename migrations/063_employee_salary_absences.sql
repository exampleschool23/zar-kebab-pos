create table if not exists public.employee_salary_absences (
  id                uuid primary key default gen_random_uuid(),
  salary_profile_id uuid not null references public.employee_salary_profiles(id) on delete cascade,
  absence_date      date not null default current_date,
  note              text not null default '',
  created_by        uuid references public.profiles(id) on delete set null,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now()
);

create unique index if not exists idx_employee_salary_absences_profile_date_unique
  on public.employee_salary_absences(salary_profile_id, absence_date);

create index if not exists idx_employee_salary_absences_profile_date
  on public.employee_salary_absences(salary_profile_id, absence_date desc);

alter table public.employee_salary_absences enable row level security;

drop policy if exists "owner_read_employee_salary_absences" on public.employee_salary_absences;
drop policy if exists "owner_write_employee_salary_absences" on public.employee_salary_absences;

create policy "owner_read_employee_salary_absences"
  on public.employee_salary_absences for select
  to authenticated
  using (public.current_staff_has_role(array['owner']));

create policy "owner_write_employee_salary_absences"
  on public.employee_salary_absences for all
  to authenticated
  using (public.current_staff_has_role(array['owner']))
  with check (public.current_staff_has_role(array['owner']));
