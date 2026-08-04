-- Notify the linked employee and the dedicated salary group when an existing
-- employee's effective-dated salary rate changes. The first rate establishes
-- the employee's starting salary, so it is intentionally not a change event.

alter table public.employee_salary_group_notification_deliveries
  drop constraint if exists employee_salary_group_notification_deliveries_event_type_check;
alter table public.employee_salary_group_notification_deliveries
  add constraint employee_salary_group_notification_deliveries_event_type_check
  check (event_type in ('bonus', 'fine', 'absence', 'rate'));

create or replace function public.queue_salary_rate_change_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.employee_salary_rates existing_rate
    where existing_rate.salary_profile_id = new.salary_profile_id
      and existing_rate.id <> new.id
  ) then
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
    employee_attempted_at
  ) values (
    'rate',
    new.id,
    new.salary_profile_id,
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

drop trigger if exists queue_salary_rate_change_telegram_delivery_trigger
  on public.employee_salary_rates;
create trigger queue_salary_rate_change_telegram_delivery_trigger
after insert on public.employee_salary_rates
for each row execute function public.queue_salary_rate_change_telegram_delivery();

revoke all on function public.queue_salary_rate_change_telegram_delivery()
  from public, anon, authenticated;

-- Historical rates are deliberately not backfilled. Only changes recorded
-- after this migration should become resendable Telegram notifications.
