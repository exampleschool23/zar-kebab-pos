-- Cafe expenses tracking for accountant cash/card/terminal spend.

create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  expense_date   date not null default current_date,
  category       text not null default 'other'
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
                   'other'
                 )),
  payment_method text not null default 'cash'
                 check (payment_method in ('cash', 'card', 'terminal')),
  amount         integer not null check (amount > 0),
  vendor         text not null default '',
  description    text not null default '',
  created_by     uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_expenses_expense_date
  on public.expenses(expense_date desc, created_at desc);

create index if not exists idx_expenses_category
  on public.expenses(category);

create index if not exists idx_expenses_payment_method
  on public.expenses(payment_method);

alter table public.expenses enable row level security;

drop policy if exists "staff_read_expenses" on public.expenses;
drop policy if exists "accounting_staff_insert_expenses" on public.expenses;
drop policy if exists "owner_admin_update_expenses" on public.expenses;
drop policy if exists "owner_admin_delete_expenses" on public.expenses;

create policy "staff_read_expenses"
  on public.expenses for select
  to authenticated
  using (public.current_staff_has_role(array['owner','admin','cashier','stakeholder']));

create policy "accounting_staff_insert_expenses"
  on public.expenses for insert
  to authenticated
  with check (
    public.current_staff_has_role(array['owner','admin','cashier'])
    and created_by = auth.uid()
  );

create policy "owner_admin_update_expenses"
  on public.expenses for update
  to authenticated
  using (public.current_staff_has_role(array['owner','admin']))
  with check (public.current_staff_has_role(array['owner','admin']));

create policy "owner_admin_delete_expenses"
  on public.expenses for delete
  to authenticated
  using (public.current_staff_has_role(array['owner','admin']));

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end $$;

