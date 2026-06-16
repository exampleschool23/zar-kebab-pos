create table if not exists public.employee_salary_bonuses (
  id                uuid primary key default gen_random_uuid(),
  salary_profile_id uuid not null references public.employee_salary_profiles(id) on delete cascade,
  bonus_date        date not null default current_date,
  amount            integer not null check (amount > 0),
  payment_method    text not null default 'cash'
                    check (payment_method in ('cash', 'card', 'terminal')),
  note              text not null default '',
  created_by        uuid references public.profiles(id) on delete set null,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists idx_employee_salary_bonuses_profile_date
  on public.employee_salary_bonuses(salary_profile_id, bonus_date desc);

alter table public.employee_salary_bonuses enable row level security;

drop policy if exists "owner_read_employee_salary_bonuses" on public.employee_salary_bonuses;
drop policy if exists "owner_write_employee_salary_bonuses" on public.employee_salary_bonuses;

create policy "owner_read_employee_salary_bonuses"
  on public.employee_salary_bonuses for select
  to authenticated
  using (public.current_staff_has_role(array['owner']));

create policy "owner_write_employee_salary_bonuses"
  on public.employee_salary_bonuses for all
  to authenticated
  using (public.current_staff_has_role(array['owner']))
  with check (public.current_staff_has_role(array['owner']));
