-- Telegram Mini App integration support.

create table if not exists public.customers (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null default '',
  phone            text,
  telegram_user_id text        unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.telegram_users (
  id               uuid        primary key default gen_random_uuid(),
  telegram_user_id text        not null unique,
  chat_id          text,
  username         text,
  first_name       text,
  last_name        text,
  language_code    text,
  preferred_language text,
  customer_id      uuid        references public.customers(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.telegram_users
  add column if not exists preferred_language text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'telegram_users_preferred_language_check') then
    alter table public.telegram_users
      add constraint telegram_users_preferred_language_check
      check (preferred_language in ('uz', 'ru', 'en')) not valid;
  end if;
end $$;

alter table public.orders
  add column if not exists source text not null default 'pos',
  add column if not exists telegram_user_id text references public.telegram_users(telegram_user_id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists notes text default '',
  add column if not exists loyalty_card_number text,
  add column if not exists loyalty_redeem_amount integer not null default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_source_check') then
    alter table public.orders
      add constraint orders_source_check
      check (source in ('pos', 'waiter', 'telegram', 'public_menu')) not valid;
  end if;
end $$;

create index if not exists idx_telegram_users_telegram_user_id
  on public.telegram_users(telegram_user_id);

create index if not exists idx_customers_telegram_user_id
  on public.customers(telegram_user_id);

create index if not exists idx_orders_source
  on public.orders(source);

create index if not exists idx_orders_telegram_user_id
  on public.orders(telegram_user_id);

alter table public.customers enable row level security;
alter table public.telegram_users enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='customers' and policyname='staff_all_customers') then
    create policy staff_all_customers on public.customers
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;

  if not exists (select 1 from pg_policies where tablename='telegram_users' and policyname='staff_all_telegram_users') then
    create policy staff_all_telegram_users on public.telegram_users
      for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
