-- Keep Telegram delivery tracking synchronized with its salary operation.
-- Payment tracking already has an ON DELETE CASCADE foreign key. Event
-- tracking is polymorphic, so it needs explicit cleanup for each source table.

-- Remove the superseded preserve-and-skip triggers if an earlier development
-- version of the absence-correction migration was applied.
drop trigger if exists void_deleted_salary_bonus_deliveries
  on public.employee_salary_bonuses;
drop trigger if exists void_deleted_salary_fine_deliveries
  on public.employee_salary_fines;
drop trigger if exists void_deleted_salary_absence_deliveries
  on public.employee_salary_absences;
drop function if exists public.void_deleted_salary_event_deliveries();

create or replace function public.cleanup_deleted_salary_event_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.employee_salary_group_notification_deliveries
  where event_type = tg_argv[0]
    and event_id = old.id;

  return old;
end;
$$;

drop trigger if exists cleanup_deleted_salary_bonus_telegram_delivery
  on public.employee_salary_bonuses;
create trigger cleanup_deleted_salary_bonus_telegram_delivery
after delete on public.employee_salary_bonuses
for each row execute function public.cleanup_deleted_salary_event_telegram_delivery('bonus');

drop trigger if exists cleanup_deleted_salary_fine_telegram_delivery
  on public.employee_salary_fines;
create trigger cleanup_deleted_salary_fine_telegram_delivery
after delete on public.employee_salary_fines
for each row execute function public.cleanup_deleted_salary_event_telegram_delivery('fine');

drop trigger if exists cleanup_deleted_salary_absence_telegram_delivery
  on public.employee_salary_absences;
create trigger cleanup_deleted_salary_absence_telegram_delivery
after delete on public.employee_salary_absences
for each row execute function public.cleanup_deleted_salary_event_telegram_delivery('absence');

drop trigger if exists cleanup_deleted_salary_rate_telegram_delivery
  on public.employee_salary_rates;
create trigger cleanup_deleted_salary_rate_telegram_delivery
after delete on public.employee_salary_rates
for each row execute function public.cleanup_deleted_salary_event_telegram_delivery('rate');

revoke all on function public.cleanup_deleted_salary_event_telegram_delivery()
  from public, anon, authenticated;

-- Remove tracking rows orphaned before this migration was installed.
delete from public.employee_salary_group_notification_deliveries delivery
where
  (delivery.event_type = 'bonus' and not exists (
    select 1 from public.employee_salary_bonuses source where source.id = delivery.event_id
  ))
  or (delivery.event_type = 'fine' and not exists (
    select 1 from public.employee_salary_fines source where source.id = delivery.event_id
  ))
  or (delivery.event_type = 'absence' and not exists (
    select 1 from public.employee_salary_absences source where source.id = delivery.event_id
  ))
  or (delivery.event_type = 'rate' and not exists (
    select 1 from public.employee_salary_rates source where source.id = delivery.event_id
  ));
