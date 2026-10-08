-- Deliver bonus, fine, and absence announcements to ZarKebab Team as a third,
-- independently retryable destination. Salary payments and rate changes remain
-- private to the employee and the dedicated salary-events group.

insert into public.telegram_notification_targets (
  target_key,
  chat_id,
  language,
  is_enabled
) values (
  'team_events',
  '-1003706661399',
  'ru',
  true
)
on conflict (target_key) do nothing;

alter table public.employee_salary_group_notification_deliveries
  add column if not exists team_status text,
  add column if not exists team_chat_id text,
  add column if not exists team_telegram_message_id text,
  add column if not exists team_error_message text,
  add column if not exists team_attempted_at timestamptz,
  add column if not exists team_sent_at timestamptz;

-- Never broadcast historical salary events during deployment. Existing bonus,
-- fine, and absence rows predate this destination, while rate changes are not
-- eligible for Team delivery at all.
update public.employee_salary_group_notification_deliveries
set
  team_status = coalesce(team_status, 'skipped'),
  team_error_message = coalesce(
    team_error_message,
    case
      when event_type = 'rate'
        then 'ZarKebab Team delivery does not apply to salary rate changes'
      else 'ZarKebab Team delivery was introduced after this event'
    end
  ),
  team_attempted_at = coalesce(team_attempted_at, created_at)
where team_status is null
   or team_error_message is null
   or team_attempted_at is null;

alter table public.employee_salary_group_notification_deliveries
  alter column team_status set default 'skipped',
  alter column team_status set not null,
  alter column team_error_message set default '',
  alter column team_error_message set not null;

alter table public.employee_salary_group_notification_deliveries
  drop constraint if exists salary_event_delivery_team_status_check;
alter table public.employee_salary_group_notification_deliveries
  add constraint salary_event_delivery_team_status_check
  check (team_status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped'));

create index if not exists idx_salary_event_team_delivery_status
  on public.employee_salary_group_notification_deliveries(
    team_status,
    team_attempted_at desc
  )
  where event_type in ('bonus', 'fine', 'absence');

-- Override migration 113's queue function so every newly saved applicable
-- event receives delivery tracking for all three destinations in one insert.
-- Rate-change rows are created by their separate migration 116 function and
-- therefore retain the non-applicable `skipped` Team default above.
create or replace function public.queue_salary_event_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    return new;
  end if;

  insert into public.employee_salary_group_notification_deliveries (
    event_type,
    event_id,
    salary_profile_id,
    status,
    error_message,
    attempted_at,
    employee_status,
    employee_error_message,
    employee_attempted_at,
    team_status,
    team_error_message,
    team_attempted_at
  ) values (
    tg_argv[0],
    new.id,
    new.salary_profile_id,
    'not_attempted',
    'Notification request has not started',
    new.created_at,
    'not_attempted',
    'Notification request has not started',
    new.created_at,
    'not_attempted',
    'Notification request has not started',
    new.created_at
  )
  on conflict (event_type, event_id) do nothing;

  return new;
end;
$$;

revoke all on function public.queue_salary_event_telegram_delivery()
  from public, anon, authenticated;
