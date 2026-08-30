-- Send one immutable Tech Card ingredient-consumption image per completed
-- Tashkent business date to the Investor group.

create table if not exists public.daily_ingredient_consumption_deliveries (
  business_date        date primary key,
  target_key           text not null default 'salary_events',
  status               text not null default 'pending'
                       check (status in ('pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id     text,
  telegram_message_id  text,
  error_message        text not null default '',
  attempted_at         timestamptz,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.daily_ingredient_consumption_deliveries is
  'Duplicate-safe delivery ledger for daily Tech Card ingredient-consumption images sent to the Investor group.';

alter table public.daily_ingredient_consumption_deliveries enable row level security;
revoke all on table public.daily_ingredient_consumption_deliveries from anon, authenticated;

insert into public.daily_ingredient_consumption_deliveries (
  business_date, status, error_message, attempted_at, updated_at
)
select
  day::date,
  'skipped',
  'Historical delivery skipped during migration',
  now(),
  now()
from generate_series(
  (timezone('Asia/Tashkent', now()))::date - 7,
  (timezone('Asia/Tashkent', now()))::date - 1,
  interval '1 day'
) day
on conflict (business_date) do nothing;

notify pgrst, 'reload schema';
