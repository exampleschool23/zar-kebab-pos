-- Return the lifetime cash remainder without downloading financial history.
-- Unpaid salary liability is intentionally excluded: salary affects cash only
-- when a payment is recorded.

begin;

create or replace function public.get_accounting_all_time_balance()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  cafe_income numeric := 0;
  recorded_income numeric := 0;
  recorded_expenses numeric := 0;
  salary_payments numeric := 0;
  legacy_paid_bonuses numeric := 0;
  employee_meals numeric := 0;
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;

  select coalesce(sum(greatest(0, round(coalesce(o.total, 0)::numeric))), 0)
  into cafe_income
  from public.orders o
  where o.status::text is distinct from 'cancelled'
    and o.payment_status::text is distinct from 'cancelled'
    and (
      o.paid_at is not null
      or (
        o.paid_at is null
        and (o.payment_status::text = 'paid' or o.status::text in ('paid', 'completed'))
      )
    );

  select
    coalesce(sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type = 'income'), 0),
    coalesce(sum(greatest(0, round(coalesce(e.amount, 0)::numeric))) filter (where e.entry_type <> 'income'), 0)
  into recorded_income, recorded_expenses
  from public.expenses e;

  select coalesce(sum(greatest(0, round(coalesce(p.amount, 0)::numeric))), 0)
  into salary_payments
  from public.employee_salary_payments p;

  select coalesce(sum(greatest(0, round(coalesce(b.amount, 0)::numeric))), 0)
  into legacy_paid_bonuses
  from public.employee_salary_bonuses b
  where b.accrues_to_salary is not true;

  select coalesce(sum(greatest(0, round(coalesce(m.total_amount, 0)::numeric))), 0)
  into employee_meals
  from public.employee_daily_meal_expenses m;

  return jsonb_build_object(
    'balance', cafe_income + recorded_income - recorded_expenses - salary_payments - legacy_paid_bonuses - employee_meals,
    'cafe_income', cafe_income,
    'recorded_income', recorded_income,
    'recorded_expenses', recorded_expenses,
    'salary_payments', salary_payments,
    'legacy_paid_bonuses', legacy_paid_bonuses,
    'employee_meals', employee_meals
  );
end;
$$;

revoke all on function public.get_accounting_all_time_balance()
  from public, anon, authenticated;
grant execute on function public.get_accounting_all_time_balance()
  to authenticated;

commit;

notify pgrst, 'reload schema';
