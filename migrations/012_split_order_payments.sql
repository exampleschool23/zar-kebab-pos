-- Split / mixed payment support.
-- One paid order can be settled with multiple methods (cash + card + loyalty, etc.).

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  method text not null check (method in ('cash', 'card', 'terminal', 'qr', 'loyalty_card', 'other')),
  amount integer not null check (amount > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_payments_order_id
  on public.order_payments(order_id);

create index if not exists idx_order_payments_method
  on public.order_payments(method);

alter table public.order_payments enable row level security;

drop policy if exists "staff can read order payments" on public.order_payments;
create policy "staff can read order payments"
  on public.order_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'admin', 'manager', 'cashier', 'waiter')
    )
  );

drop policy if exists "cashiers can insert order payments" on public.order_payments;
create policy "cashiers can insert order payments"
  on public.order_payments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'admin', 'manager', 'cashier')
    )
  );

drop policy if exists "cashiers can replace unpaid order payments" on public.order_payments;
create policy "cashiers can replace unpaid order payments"
  on public.order_payments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('owner', 'admin', 'manager', 'cashier')
    )
    and exists (
      select 1
      from public.orders o
      where o.id = order_payments.order_id
        and coalesce(o.payment_status, 'unpaid') <> 'paid'
    )
  );

