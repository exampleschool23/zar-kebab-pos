-- period_from and period_to on employee_salary_payments were never meaningful:
-- the UI never rendered them usefully, and the accounting logic only needs
-- paid_date + amount + payment_method.  Drop them to keep the schema clean.

alter table public.employee_salary_payments
  drop column if exists period_from,
  drop column if exists period_to;
