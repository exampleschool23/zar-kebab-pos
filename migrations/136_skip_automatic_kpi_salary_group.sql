-- Automatic KPI details belong only in ZarKebab Team. The aggregate daily
-- salary/KPI summary still goes to Salary Events (the app-improvements group),
-- but individual automatic KPI rows must not be broadcast there.

begin;

update public.employee_salary_group_notification_deliveries delivery
   set status = 'skipped',
       telegram_chat_id = null,
       telegram_message_id = null,
       error_message = 'Automatic KPI details are sent only to ZarKebab Team',
       sent_at = null,
       updated_at = now()
  from public.employee_salary_bonuses bonus
 where delivery.event_type = 'bonus'
   and delivery.event_id = bonus.id
   and bonus.source_type = 'daily_kpi'
   and delivery.status in ('not_attempted', 'failed', 'skipped');

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

revoke all on function public.queue_salary_event_telegram_delivery() from public;
revoke all on function public.queue_salary_event_telegram_delivery() from anon;
revoke all on function public.queue_salary_event_telegram_delivery() from authenticated;

notify pgrst, 'reload schema';

commit;
