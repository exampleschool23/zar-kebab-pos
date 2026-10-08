-- Track private employee delivery for bonus, fine, and absence notifications.
-- Group delivery remains in the original columns added by migration 111.

alter table public.employee_salary_group_notification_deliveries
  add column if not exists employee_status text,
  add column if not exists employee_chat_id text,
  add column if not exists employee_telegram_message_id text,
  add column if not exists employee_error_message text,
  add column if not exists employee_attempted_at timestamptz,
  add column if not exists employee_sent_at timestamptz;

-- Existing group-event records predate private delivery tracking and must not
-- appear as if an employee notification is still waiting to send.
update public.employee_salary_group_notification_deliveries
set
  employee_status = coalesce(employee_status, 'skipped'),
  employee_error_message = coalesce(
    employee_error_message,
    'Private employee delivery was not tracked before migration 112'
  ),
  employee_attempted_at = coalesce(employee_attempted_at, attempted_at)
where employee_status is null
   or employee_error_message is null
   or employee_attempted_at is null;

alter table public.employee_salary_group_notification_deliveries
  alter column employee_status set default 'skipped',
  alter column employee_status set not null,
  alter column employee_error_message set default '',
  alter column employee_error_message set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'salary_event_delivery_employee_status_check'
      and conrelid = 'public.employee_salary_group_notification_deliveries'::regclass
  ) then
    alter table public.employee_salary_group_notification_deliveries
      add constraint salary_event_delivery_employee_status_check
      check (employee_status in ('pending', 'sent', 'failed', 'skipped'));
  end if;
end
$$;

create index if not exists idx_salary_event_employee_delivery_status
  on public.employee_salary_group_notification_deliveries(
    employee_status,
    employee_attempted_at desc
  );
