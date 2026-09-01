-- Accumulate new manual and automatic KPI bonuses into salary liability.
--
-- Existing bonus rows were historically recorded as immediate cash expenses, so
-- they retain false. The default is switched only after that legacy snapshot is
-- established; every bonus inserted after this migration accrues until a salary
-- payment settles it.

alter table public.employee_salary_bonuses
  add column if not exists accrues_to_salary boolean not null default false;

alter table public.employee_salary_bonuses
  alter column accrues_to_salary set default true;

comment on column public.employee_salary_bonuses.accrues_to_salary is
  'False preserves legacy immediately-paid bonuses; true adds the bonus to salary liability until settled by a salary payment.';

create or replace function public.enforce_salary_bonus_accrual()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.accrues_to_salary := true;
    return new;
  end if;

  if new.accrues_to_salary is distinct from old.accrues_to_salary then
    raise exception 'Salary bonus settlement mode is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_salary_bonus_accrual_trigger
  on public.employee_salary_bonuses;
create trigger enforce_salary_bonus_accrual_trigger
before insert or update of accrues_to_salary on public.employee_salary_bonuses
for each row execute function public.enforce_salary_bonus_accrual();

notify pgrst, 'reload schema';
