-- Reject new expense-dated cashflow rows older than the previous three
-- Tashkent calendar days. Existing historical rows remain readable and may
-- be updated without changing their date or entry type.
begin;

create or replace function public.enforce_expense_entry_date_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tashkent_today date := (timezone('Asia/Tashkent', now()))::date;
  earliest_allowed date := tashkent_today - 3;
  enters_restricted_date boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    enters_restricted_date := new.expense_date is distinct from old.expense_date
      or new.entry_type is distinct from old.entry_type;
  end if;

  if new.entry_type = 'expense'
    and new.expense_date < earliest_allowed
    and enters_restricted_date
  then
    raise exception 'Expense date must be on or after %', earliest_allowed
      using errcode = '22007';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_expense_entry_date_window on public.expenses;
create trigger enforce_expense_entry_date_window
before insert or update of expense_date, entry_type on public.expenses
for each row execute function public.enforce_expense_entry_date_window();

revoke all on function public.enforce_expense_entry_date_window() from public, anon, authenticated;

commit;
