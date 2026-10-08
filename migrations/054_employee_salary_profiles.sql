-- Employee salary ledger.
-- Salary rates are effective-dated so changing a salary today does not rewrite
-- previous days or months.

create table if not exists public.employee_salary_profiles (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid references public.profiles(id) on delete set null,
  employee_name  text not null default '',
  joined_at      date not null default current_date,
  pay_schedule   text not null default 'monthly'
                 check (pay_schedule in ('daily', 'twice_weekly', 'monthly')),
  payment_method text not null default 'cash'
                 check (payment_method in ('cash', 'card', 'terminal')),
  is_active      boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.employee_salary_rates (
  id                uuid primary key default gen_random_uuid(),
  salary_profile_id uuid not null references public.employee_salary_profiles(id) on delete cascade,
  effective_from    date not null default current_date,
  amount            integer not null check (amount > 0),
  rate_unit         text not null default 'daily'
                    check (rate_unit in ('daily', 'monthly')),
  note              text not null default '',
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table if not exists public.employee_salary_payments (
  id                uuid primary key default gen_random_uuid(),
  salary_profile_id uuid not null references public.employee_salary_profiles(id) on delete cascade,
  paid_date         date not null default current_date,
  period_from       date not null,
  period_to         date not null,
  amount            integer not null check (amount > 0),
  payment_method    text not null default 'cash'
                    check (payment_method in ('cash', 'card', 'terminal')),
  note              text not null default '',
  created_by        uuid references public.profiles(id) on delete set null,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now(),
  check (period_from <= period_to)
);

create index if not exists idx_employee_salary_profiles_profile_id
  on public.employee_salary_profiles(profile_id);

create unique index if not exists idx_employee_salary_profiles_profile_id_unique
  on public.employee_salary_profiles(profile_id)
  where profile_id is not null;

create index if not exists idx_employee_salary_profiles_joined_at
  on public.employee_salary_profiles(joined_at);

create index if not exists idx_employee_salary_rates_profile_effective
  on public.employee_salary_rates(salary_profile_id, effective_from desc);

create index if not exists idx_employee_salary_payments_profile_paid
  on public.employee_salary_payments(salary_profile_id, paid_date desc);

alter table public.employee_salary_profiles enable row level security;
alter table public.employee_salary_rates enable row level security;
alter table public.employee_salary_payments enable row level security;

drop policy if exists "owner_read_employee_salary_profiles" on public.employee_salary_profiles;
drop policy if exists "owner_write_employee_salary_profiles" on public.employee_salary_profiles;
drop policy if exists "owner_read_employee_salary_rates" on public.employee_salary_rates;
drop policy if exists "owner_write_employee_salary_rates" on public.employee_salary_rates;
drop policy if exists "owner_read_employee_salary_payments" on public.employee_salary_payments;
drop policy if exists "owner_write_employee_salary_payments" on public.employee_salary_payments;

create policy "owner_read_employee_salary_profiles"
  on public.employee_salary_profiles for select
  to authenticated
  using (public.current_staff_has_role(array['owner']));

create policy "owner_write_employee_salary_profiles"
  on public.employee_salary_profiles for all
  to authenticated
  using (public.current_staff_has_role(array['owner']))
  with check (public.current_staff_has_role(array['owner']));

create policy "owner_read_employee_salary_rates"
  on public.employee_salary_rates for select
  to authenticated
  using (public.current_staff_has_role(array['owner']));

create policy "owner_write_employee_salary_rates"
  on public.employee_salary_rates for all
  to authenticated
  using (public.current_staff_has_role(array['owner']))
  with check (public.current_staff_has_role(array['owner']));

create policy "owner_read_employee_salary_payments"
  on public.employee_salary_payments for select
  to authenticated
  using (public.current_staff_has_role(array['owner']));

create policy "owner_write_employee_salary_payments"
  on public.employee_salary_payments for all
  to authenticated
  using (public.current_staff_has_role(array['owner']))
  with check (public.current_staff_has_role(array['owner']));
