-- Deliver each completed Tashkent day's Bazaar summary to the Salary Events
-- Telegram target exactly once from the existing daily salary cron.

create table if not exists public.daily_bazaar_telegram_deliveries (
  purchase_date        date primary key,
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

comment on table public.daily_bazaar_telegram_deliveries is
  'Duplicate-safe delivery ledger for automatic Daily Bazaar summaries sent by the salary cron.';

alter table public.daily_bazaar_telegram_deliveries enable row level security;
revoke all on table public.daily_bazaar_telegram_deliveries from anon, authenticated;

-- Never broadcast Bazaar history merely because this feature was deployed.
-- The first automatic message is for the first date completed after migration.
insert into public.daily_bazaar_telegram_deliveries (
  purchase_date,
  status,
  error_message,
  attempted_at,
  updated_at
)
select distinct
  purchase.purchase_date,
  'skipped',
  'Historical delivery skipped during migration',
  now(),
  now()
from public.bazaar_purchases purchase
where purchase.entry_source = 'daily_bazaar'
  and purchase.purchase_date < (timezone('Asia/Tashkent', now()))::date
on conflict (purchase_date) do nothing;

notify pgrst, 'reload schema';
