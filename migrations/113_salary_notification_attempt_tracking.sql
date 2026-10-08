-- Create a delivery record as soon as a salary operation is saved.
-- This keeps failed or stale-browser notification requests visible instead of
-- leaving no audit row for the employee or salary group.

alter table public.employee_salary_payment_notification_deliveries
  drop constraint if exists employee_salary_payment_notification_deliveries_status_check;
alter table public.employee_salary_payment_notification_deliveries
  add constraint employee_salary_payment_notification_deliveries_status_check
  check (status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped', 'confirmed'));

alter table public.employee_salary_payment_notification_deliveries
  drop constraint if exists salary_payment_delivery_group_status_check;
alter table public.employee_salary_payment_notification_deliveries
  add constraint salary_payment_delivery_group_status_check
  check (group_status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped'));

alter table public.employee_salary_group_notification_deliveries
  drop constraint if exists employee_salary_group_notification_deliveries_status_check;
alter table public.employee_salary_group_notification_deliveries
  add constraint employee_salary_group_notification_deliveries_status_check
  check (status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped'));

alter table public.employee_salary_group_notification_deliveries
  drop constraint if exists salary_event_delivery_employee_status_check;
alter table public.employee_salary_group_notification_deliveries
  add constraint salary_event_delivery_employee_status_check
  check (employee_status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped'));

create or replace function public.queue_salary_payment_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.employee_salary_payment_notification_deliveries (
    payment_id,
    salary_profile_id,
    status,
    error_message,
    attempted_at,
    group_status,
    group_error_message,
    group_attempted_at
  ) values (
    new.id,
    new.salary_profile_id,
    'not_attempted',
    'Notification request has not started',
    new.created_at,
    'not_attempted',
    'Notification request has not started',
    new.created_at
  )
  on conflict (payment_id) do nothing;
  return new;
end;
$$;

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
    employee_attempted_at
  ) values (
    tg_argv[0],
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

drop trigger if exists queue_salary_payment_telegram_delivery_trigger
  on public.employee_salary_payments;
create trigger queue_salary_payment_telegram_delivery_trigger
after insert on public.employee_salary_payments
for each row execute function public.queue_salary_payment_telegram_delivery();

drop trigger if exists queue_salary_bonus_telegram_delivery_trigger
  on public.employee_salary_bonuses;
create trigger queue_salary_bonus_telegram_delivery_trigger
after insert on public.employee_salary_bonuses
for each row execute function public.queue_salary_event_telegram_delivery('bonus');

drop trigger if exists queue_salary_fine_telegram_delivery_trigger
  on public.employee_salary_fines;
create trigger queue_salary_fine_telegram_delivery_trigger
after insert on public.employee_salary_fines
for each row execute function public.queue_salary_event_telegram_delivery('fine');

drop trigger if exists queue_salary_absence_telegram_delivery_trigger
  on public.employee_salary_absences;
create trigger queue_salary_absence_telegram_delivery_trigger
after insert on public.employee_salary_absences
for each row execute function public.queue_salary_event_telegram_delivery('absence');

revoke all on function public.queue_salary_payment_telegram_delivery()
  from public, anon, authenticated;
revoke all on function public.queue_salary_event_telegram_delivery()
  from public, anon, authenticated;

-- Recover salary operations saved after group notification tracking was
-- configured but whose browser request never reached the server endpoint.
with tracking_start as (
  select created_at
  from public.telegram_notification_targets
  where target_key = 'salary_events'
),
missing_payments as (
  select payment.id, payment.salary_profile_id, payment.created_at
  from public.employee_salary_payments payment
  cross join tracking_start
  where payment.created_at >= tracking_start.created_at
)
insert into public.employee_salary_payment_notification_deliveries (
  payment_id,
  salary_profile_id,
  status,
  error_message,
  attempted_at,
  group_status,
  group_error_message,
  group_attempted_at
)
select
  payment.id,
  payment.salary_profile_id,
  'not_attempted',
  'Notification request was not recorded when the operation was saved',
  payment.created_at,
  'not_attempted',
  'Notification request was not recorded when the operation was saved',
  payment.created_at
from missing_payments payment
on conflict (payment_id) do nothing;

with tracking_start as (
  select created_at
  from public.telegram_notification_targets
  where target_key = 'salary_events'
),
missing_events as (
  select 'bonus'::text as event_type, bonus.id, bonus.salary_profile_id, bonus.created_at
  from public.employee_salary_bonuses bonus
  cross join tracking_start
  where bonus.created_at >= tracking_start.created_at
    and bonus.created_by is not null
  union all
  select 'fine'::text, fine.id, fine.salary_profile_id, fine.created_at
  from public.employee_salary_fines fine
  cross join tracking_start
  where fine.created_at >= tracking_start.created_at
    and fine.created_by is not null
  union all
  select 'absence'::text, absence.id, absence.salary_profile_id, absence.created_at
  from public.employee_salary_absences absence
  cross join tracking_start
  where absence.created_at >= tracking_start.created_at
    and absence.created_by is not null
)
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
)
select
  event.event_type,
  event.id,
  event.salary_profile_id,
  'not_attempted',
  'Notification request was not recorded when the operation was saved',
  event.created_at,
  'not_attempted',
  'Notification request was not recorded when the operation was saved',
  event.created_at
from missing_events event
on conflict (event_type, event_id) do nothing;
