-- Protect salary accrual history using Tashkent calendar days, for every role.
begin;

create or replace function public.enforce_salary_rate_date_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  earliest_allowed date := timezone('Asia/Tashkent', now())::date - 3;
begin
  if tg_op = 'UPDATE' then
    if old.effective_from < earliest_allowed then
      raise exception 'Salary rates older than three days cannot be changed'
        using errcode = '22007';
    end if;
  end if;
  if new.effective_from < earliest_allowed then
    raise exception 'Salary date must be on or after %', earliest_allowed
      using errcode = '22007';
  end if;
  return new;
end;
$$;

create trigger enforce_salary_rate_date_window
before insert or update on public.employee_salary_rates
for each row execute function public.enforce_salary_rate_date_window();

revoke all on function public.enforce_salary_rate_date_window() from public, anon, authenticated;
commit;
