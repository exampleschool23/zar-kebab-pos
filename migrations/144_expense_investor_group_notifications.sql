-- Queue every newly recorded cash expense for one duplicate-safe notification
-- to the configured ZarKebab Investor Telegram group (legacy target key:
-- salary_events). Existing expenses are intentionally not backfilled.

begin;

create table if not exists public.expense_investor_notification_deliveries (
  expense_id            uuid primary key references public.expenses(id) on delete cascade,
  target_key            text not null default 'salary_events',
  expense_date          date not null,
  category              text not null,
  payment_method        text not null,
  amount                bigint not null check (amount > 0),
  vendor                text not null default '',
  description           text not null default '',
  actor_id              uuid references public.profiles(id) on delete set null,
  actor_name            text not null,
  status                text not null default 'not_attempted'
                        check (status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id      text,
  telegram_message_id   text,
  error_message         text not null default 'Notification request has not started',
  attempted_at          timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.expense_investor_notification_deliveries is
  'Immutable expense snapshots and duplicate-safe ZarKebab Investor Telegram delivery status.';

create index if not exists idx_expense_investor_notification_delivery_status
  on public.expense_investor_notification_deliveries(status, attempted_at, created_at desc);

alter table public.expense_investor_notification_deliveries enable row level security;
revoke all on table public.expense_investor_notification_deliveries
  from public, anon, authenticated;

create or replace function public.queue_expense_investor_notification_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id_value uuid;
  actor_name_value text;
begin
  if new.entry_type <> 'expense' then
    return new;
  end if;

  actor_id_value := coalesce(new.created_by, auth.uid());

  select coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), '')
  )
  into actor_name_value
  from public.profiles as profile
  where profile.id = actor_id_value;

  actor_name_value := coalesce(
    actor_name_value,
    nullif(btrim(new.created_by_name), ''),
    'Система'
  );

  insert into public.expense_investor_notification_deliveries (
    expense_id,
    expense_date,
    category,
    payment_method,
    amount,
    vendor,
    description,
    actor_id,
    actor_name
  ) values (
    new.id,
    new.expense_date,
    new.category,
    new.payment_method,
    new.amount,
    coalesce(new.vendor, ''),
    coalesce(new.description, ''),
    actor_id_value,
    actor_name_value
  );

  return new;
end;
$$;

revoke all on function public.queue_expense_investor_notification_delivery()
  from public, anon, authenticated;

drop trigger if exists queue_expense_investor_notification_delivery_trigger
  on public.expenses;
create trigger queue_expense_investor_notification_delivery_trigger
after insert on public.expenses
for each row
when (new.entry_type = 'expense')
execute function public.queue_expense_investor_notification_delivery();

commit;

notify pgrst, 'reload schema';
