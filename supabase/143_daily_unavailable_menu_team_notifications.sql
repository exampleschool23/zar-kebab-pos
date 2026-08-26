-- Send one current unavailable-menu snapshot to ZarKebab Team for each
-- Tashkent business date. The delivery ledger makes duplicate cron invocations
-- safe and preserves the exact product ids/names included in the message.

begin;

create table if not exists public.daily_unavailable_menu_notification_deliveries (
  business_date        date primary key,
  target_key           text not null default 'team_events',
  item_count           integer not null default 0 check (item_count >= 0),
  item_ids             jsonb not null default '[]'::jsonb
                         check (jsonb_typeof(item_ids) = 'array'),
  item_names           jsonb not null default '[]'::jsonb
                         check (jsonb_typeof(item_names) = 'array'),
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

comment on table public.daily_unavailable_menu_notification_deliveries is
  'Duplicate-safe daily snapshots of unavailable active menu products sent to ZarKebab Team.';

alter table public.daily_unavailable_menu_notification_deliveries enable row level security;
revoke all on table public.daily_unavailable_menu_notification_deliveries
  from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
