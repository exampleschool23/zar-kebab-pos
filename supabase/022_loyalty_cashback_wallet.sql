-- Loyalty cashback wallet.
-- Replaces active percentage card discounts with stored wallet balance.

create table if not exists public.loyalty_cards (
  id             uuid primary key default gen_random_uuid(),
  card_number    text not null unique,
  public_token   text not null unique default gen_random_uuid()::text,
  customer_name  text not null default '',
  phone_number   text,
  cashback_type  text not null default 'bronze' check (cashback_type in ('bronze', 'silver', 'gold', 'premium', 'black')),
  balance        integer not null default 0 check (balance >= 0),
  total_earned   integer not null default 0 check (total_earned >= 0),
  total_redeemed integer not null default 0 check (total_redeemed >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id              uuid primary key default gen_random_uuid(),
  loyalty_card_id uuid not null references public.loyalty_cards(id) on delete cascade,
  order_id        text references public.orders(id) on delete set null,
  type            text not null check (type in (
                    'cashback_earned',
                    'redeemed',
                    'manual_adjustment',
                    'refund_reversal',
                    'migrated_discount_card'
                  )),
  amount          integer not null check (amount > 0),
  balance_before  integer not null check (balance_before >= 0),
  balance_after   integer not null check (balance_after >= 0),
  reason          text,
  created_by      uuid references public.profiles(id) on delete set null,
  cashback_percent_used numeric check (cashback_percent_used is null or (cashback_percent_used >= 0 and cashback_percent_used <= 100)),
  card_type_at_transaction text check (card_type_at_transaction is null or card_type_at_transaction in ('bronze', 'silver', 'gold', 'premium', 'black')),
  created_at      timestamptz not null default now()
);

alter table public.loyalty_cards
  add column if not exists cashback_type text not null default 'bronze';

alter table public.loyalty_transactions
  add column if not exists cashback_percent_used numeric,
  add column if not exists card_type_at_transaction text;

alter table public.orders
  add column if not exists loyalty_used_amount integer not null default 0 check (loyalty_used_amount >= 0),
  add column if not exists cashback_earned integer not null default 0 check (cashback_earned >= 0),
  add column if not exists cashback_percent numeric not null default 0 check (cashback_percent >= 0 and cashback_percent <= 100);

-- Historical orders may still have loyalty_discount_* values. Keep those columns for
-- old receipt/report readability, but mirror wallet redemptions into the old amount
-- column while new code reads loyalty_used_amount first.
update public.orders
set loyalty_used_amount = greatest(coalesce(loyalty_used_amount, 0), coalesce(loyalty_redeem_amount, 0), coalesce(loyalty_discount_amount, 0))
where coalesce(loyalty_used_amount, 0) = 0
  and (coalesce(loyalty_redeem_amount, 0) > 0 or coalesce(loyalty_discount_amount, 0) > 0);

create index if not exists idx_loyalty_cards_card_number
  on public.loyalty_cards(card_number);

create index if not exists idx_loyalty_transactions_card
  on public.loyalty_transactions(loyalty_card_id, created_at desc);

create index if not exists idx_orders_loyalty_card_number
  on public.orders(loyalty_card_number);

alter table public.loyalty_cards enable row level security;
alter table public.loyalty_transactions enable row level security;

do $$ begin
  drop policy if exists staff_all_loyalty_cards on public.loyalty_cards;
  drop policy if exists staff_all_loyalty_transactions on public.loyalty_transactions;

  if not exists (select 1 from pg_policies where tablename='loyalty_cards' and policyname='staff_read_loyalty_cards') then
    create policy staff_read_loyalty_cards on public.loyalty_cards
      for select using (public.current_staff_has_role(array['owner','admin','cashier']));
  end if;

  if not exists (select 1 from pg_policies where tablename='loyalty_cards' and policyname='owner_create_loyalty_cards') then
    create policy owner_create_loyalty_cards on public.loyalty_cards
      for insert with check (public.current_staff_has_role(array['owner']));
  end if;

  if not exists (select 1 from pg_policies where tablename='loyalty_cards' and policyname='owner_cashier_update_loyalty_cards') then
    create policy owner_cashier_update_loyalty_cards on public.loyalty_cards
      for update using (public.current_staff_has_role(array['owner','cashier']))
      with check (public.current_staff_has_role(array['owner','cashier']));
  end if;

  if not exists (select 1 from pg_policies where tablename='loyalty_transactions' and policyname='staff_read_loyalty_transactions') then
    create policy staff_read_loyalty_transactions on public.loyalty_transactions
      for select using (public.current_staff_has_role(array['owner','admin','cashier']));
  end if;

  if not exists (select 1 from pg_policies where tablename='loyalty_transactions' and policyname='owner_cashier_insert_loyalty_transactions') then
    create policy owner_cashier_insert_loyalty_transactions on public.loyalty_transactions
      for insert with check (public.current_staff_has_role(array['owner','cashier']));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'loyalty_cards'
  ) then
    alter publication supabase_realtime add table public.loyalty_cards;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'loyalty_transactions'
  ) then
    alter publication supabase_realtime add table public.loyalty_transactions;
  end if;
end $$;
