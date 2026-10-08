alter table if exists public.expenses
  add column if not exists entry_type text;

update public.expenses
set entry_type = 'expense'
where entry_type is null or btrim(entry_type) = '';

alter table if exists public.expenses
  alter column entry_type set default 'expense';

alter table if exists public.expenses
  alter column entry_type set not null;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.expenses'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%category in%';

  if constraint_name is not null then
    execute format('alter table public.expenses drop constraint %I', constraint_name);
  end if;
end $$;

alter table if exists public.expenses
  add constraint expenses_category_check
  check (category in (
    'salary_cook',
    'salary_manager',
    'salary_waiter',
    'salary_other',
    'products_bazaar',
    'equipment',
    'utilities',
    'rent',
    'delivery',
    'marketing',
    'repair',
    'other',
    'investor_support',
    'other_income'
  ));

alter table if exists public.expenses
  drop constraint if exists expenses_entry_type_check;

alter table if exists public.expenses
  add constraint expenses_entry_type_check
  check (entry_type in ('expense', 'income'));
