-- ============================================================
-- Zar Kebab POS — Payment audit log and paid-order guardrails
-- Run after 003_pos_schema.sql and 009_guest_public_menu.sql.
-- ============================================================

-- Keep money fields sane at the database boundary. NOT VALID avoids failing on
-- old historical rows, but PostgreSQL still enforces these checks for new writes.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_subtotal_nonnegative') then
    alter table public.orders add constraint orders_subtotal_nonnegative check (subtotal >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_service_fee_nonnegative') then
    alter table public.orders add constraint orders_service_fee_nonnegative check (service_fee >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_total_nonnegative') then
    alter table public.orders add constraint orders_total_nonnegative check (total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_service_rate_pct_range') then
    alter table public.orders add constraint orders_service_rate_pct_range check (service_rate_pct between 0 and 100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_loyalty_discount_pct_range') then
    alter table public.orders add constraint orders_loyalty_discount_pct_range check (coalesce(loyalty_discount_pct, 0) between 0 and 100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_loyalty_discount_amount_nonnegative') then
    alter table public.orders add constraint orders_loyalty_discount_amount_nonnegative check (coalesce(loyalty_discount_amount, 0) >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_price_nonnegative') then
    alter table public.order_items add constraint order_items_price_nonnegative check (price >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_quantity_positive') then
    alter table public.order_items add constraint order_items_quantity_positive check (quantity > 0) not valid;
  end if;
end $$;

-- Append-only audit table for money-sensitive order transitions.
create table if not exists public.order_payment_audit (
  id                 bigserial primary key,
  order_id           text not null references public.orders(id) on delete cascade,
  actor_id           uuid,
  action             text not null,
  old_payment_status text,
  new_payment_status text,
  old_status         text,
  new_status         text,
  old_total          integer,
  new_total          integer,
  old_subtotal       integer,
  new_subtotal       integer,
  old_service_fee    integer,
  new_service_fee    integer,
  old_service_rate_pct integer,
  new_service_rate_pct integer,
  old_discount_pct   integer,
  new_discount_pct   integer,
  old_discount_amount integer,
  new_discount_amount integer,
  old_payment_method text,
  new_payment_method text,
  changed_at         timestamptz not null default now()
);

create index if not exists idx_order_payment_audit_order_id
  on public.order_payment_audit(order_id, changed_at desc);

alter table public.order_payment_audit enable row level security;

drop policy if exists "Staff: read payment audit" on public.order_payment_audit;
drop policy if exists "Owner/Admin: read payment audit" on public.order_payment_audit;
create policy "Owner/Admin: read payment audit"
  on public.order_payment_audit for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('owner', 'admin')
    )
  );

-- Audit rows are written by SECURITY DEFINER trigger only.
drop policy if exists "No direct payment audit writes" on public.order_payment_audit;
create policy "No direct payment audit writes"
  on public.order_payment_audit for insert
  with check (false);

create or replace function public.guard_and_audit_order_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_paid boolean;
  new_paid boolean;
  money_changed boolean;
  status_changed boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  old_paid := old.payment_status = 'paid' or old.status in ('paid', 'completed') or old.paid_at is not null;
  new_paid := new.payment_status = 'paid' or new.status in ('paid', 'completed') or new.paid_at is not null;

  money_changed :=
    old.subtotal is distinct from new.subtotal or
    old.service_fee is distinct from new.service_fee or
    old.service_rate_pct is distinct from new.service_rate_pct or
    old.total is distinct from new.total or
    coalesce(old.loyalty_discount_pct, 0) is distinct from coalesce(new.loyalty_discount_pct, 0) or
    coalesce(old.loyalty_discount_amount, 0) is distinct from coalesce(new.loyalty_discount_amount, 0);

  status_changed :=
    old.status is distinct from new.status or
    old.payment_status is distinct from new.payment_status or
    old.paid_at is distinct from new.paid_at or
    old.payment_method is distinct from new.payment_method;

  -- Once an order is paid, revenue fields become immutable. If a correction is
  -- needed, create a refund/adjustment workflow instead of editing paid revenue.
  if old_paid and money_changed then
    raise exception 'Paid order % financial fields are locked', old.id
      using errcode = '23514';
  end if;

  if old_paid and not new_paid then
    raise exception 'Paid order % cannot be reopened by direct update', old.id
      using errcode = '23514';
  end if;

  if new_paid and new.paid_at is null then
    new.paid_at := now();
  end if;

  if money_changed or status_changed then
    insert into public.order_payment_audit (
      order_id,
      actor_id,
      action,
      old_payment_status,
      new_payment_status,
      old_status,
      new_status,
      old_total,
      new_total,
      old_subtotal,
      new_subtotal,
      old_service_fee,
      new_service_fee,
      old_service_rate_pct,
      new_service_rate_pct,
      old_discount_pct,
      new_discount_pct,
      old_discount_amount,
      new_discount_amount,
      old_payment_method,
      new_payment_method
    ) values (
      new.id,
      auth.uid(),
      case
        when not old_paid and new_paid then 'mark_paid'
        when old_paid and not new_paid then 'reopen_paid_order'
        when money_changed then 'payment_fields_changed'
        else 'status_changed'
      end,
      old.payment_status,
      new.payment_status,
      old.status,
      new.status,
      old.total,
      new.total,
      old.subtotal,
      new.subtotal,
      old.service_fee,
      new.service_fee,
      old.service_rate_pct,
      new.service_rate_pct,
      old.loyalty_discount_pct,
      new.loyalty_discount_pct,
      old.loyalty_discount_amount,
      new.loyalty_discount_amount,
      old.payment_method,
      new.payment_method
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_and_audit_order_payment on public.orders;
create trigger guard_and_audit_order_payment
  before update on public.orders
  for each row
  execute function public.guard_and_audit_order_payment();

create or replace function public.guard_paid_order_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_order_id text;
  parent_is_paid boolean;
begin
  parent_order_id := coalesce(new.order_id, old.order_id);

  select exists (
    select 1
    from public.orders o
    where o.id = parent_order_id
      and (
        o.payment_status = 'paid' or
        o.status in ('paid', 'completed') or
        o.paid_at is not null
      )
  ) into parent_is_paid;

  if parent_is_paid then
    raise exception 'Items for paid order % are locked', parent_order_id
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_paid_order_items on public.order_items;
create trigger guard_paid_order_items
  before insert or update or delete on public.order_items
  for each row
  execute function public.guard_paid_order_items();
