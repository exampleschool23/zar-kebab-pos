-- Track salary-payment Telegram delivery to the payroll group independently
-- from the private employee notification.

alter table public.employee_salary_payment_notification_deliveries
  add column if not exists group_status text,
  add column if not exists group_chat_id text,
  add column if not exists group_telegram_message_id text,
  add column if not exists group_error_message text,
  add column if not exists group_attempted_at timestamptz,
  add column if not exists group_sent_at timestamptz;

-- Historical notifications predate group delivery and must not look pending.
update public.employee_salary_payment_notification_deliveries
set
  group_status = coalesce(group_status, 'skipped'),
  group_error_message = coalesce(
    group_error_message,
    'Group delivery was not tracked before migration 110'
  ),
  group_attempted_at = coalesce(group_attempted_at, attempted_at)
where group_status is null
   or group_error_message is null
   or group_attempted_at is null;

alter table public.employee_salary_payment_notification_deliveries
  alter column group_status set default 'pending',
  alter column group_status set not null,
  alter column group_error_message set default '',
  alter column group_error_message set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'salary_payment_delivery_group_status_check'
      and conrelid = 'public.employee_salary_payment_notification_deliveries'::regclass
  ) then
    alter table public.employee_salary_payment_notification_deliveries
      add constraint salary_payment_delivery_group_status_check
      check (group_status in ('pending', 'sent', 'failed', 'skipped'));
  end if;
end
$$;

create index if not exists idx_salary_payment_notification_group_status
  on public.employee_salary_payment_notification_deliveries(
    group_status,
    group_attempted_at desc
  );
