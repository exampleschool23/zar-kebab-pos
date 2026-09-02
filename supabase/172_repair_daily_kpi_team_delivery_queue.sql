-- Restore automatic KPI Team delivery queueing and backfill any generated KPI
-- bonuses whose delivery ledger row was missed. Backfill only queues rows; the
-- duplicate-safe daily cron performs Telegram delivery.

begin;

create or replace function public.queue_salary_event_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_automatic_kpi boolean := tg_argv[0] = 'bonus'
    and coalesce(to_jsonb(new) ->> 'source_type', '') = 'daily_kpi';
begin
  if new.created_by is null and not is_automatic_kpi then
    return new;
  end if;

  insert into public.employee_salary_group_notification_deliveries (
    event_type, event_id, salary_profile_id,
    status, error_message, attempted_at,
    employee_status, employee_error_message, employee_attempted_at,
    team_status, team_error_message, team_attempted_at
  ) values (
    tg_argv[0], new.id, new.salary_profile_id,
    case when is_automatic_kpi then 'skipped' else 'not_attempted' end,
    case when is_automatic_kpi
      then 'Automatic KPI details are sent only to ZarKebab Team'
      else 'Notification request has not started' end,
    new.created_at,
    case when is_automatic_kpi then 'skipped' else 'not_attempted' end,
    case when is_automatic_kpi
      then 'Automatic KPI is included in the combined daily salary summary'
      else 'Notification request has not started' end,
    new.created_at,
    case when tg_argv[0] in ('bonus', 'fine', 'absence')
      then 'not_attempted' else 'skipped' end,
    case when tg_argv[0] in ('bonus', 'fine', 'absence')
      then 'Notification request has not started'
      else 'ZarKebab Team delivery does not apply to this salary event' end,
    new.created_at
  )
  on conflict (event_type, event_id) do nothing;

  return new;
end;
$$;

drop trigger if exists queue_salary_bonus_telegram_delivery_trigger
  on public.employee_salary_bonuses;
create trigger queue_salary_bonus_telegram_delivery_trigger
after insert on public.employee_salary_bonuses
for each row execute function public.queue_salary_event_telegram_delivery('bonus');

insert into public.employee_salary_group_notification_deliveries (
  event_type, event_id, salary_profile_id,
  status, error_message, attempted_at,
  employee_status, employee_error_message, employee_attempted_at,
  team_status, team_error_message, team_attempted_at
)
select
  'bonus', bonus.id, bonus.salary_profile_id,
  'skipped', 'Automatic KPI details are sent only to ZarKebab Team', bonus.created_at,
  'skipped', 'Automatic KPI is included in the combined daily salary summary', bonus.created_at,
  'not_attempted', 'Notification request has not started', bonus.created_at
from public.employee_salary_bonuses bonus
where bonus.source_type = 'daily_kpi'
  and not exists (
    select 1
    from public.employee_salary_group_notification_deliveries delivery
    where delivery.event_type = 'bonus'
      and delivery.event_id = bonus.id
  )
on conflict (event_type, event_id) do nothing;

revoke all on function public.queue_salary_event_telegram_delivery()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
