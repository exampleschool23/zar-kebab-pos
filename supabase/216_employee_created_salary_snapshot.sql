-- Show the starting base salary on the Investor "new employee" notice.
-- The lifecycle event is queued when the salary profile is inserted, before
-- its first rate exists, so the first rate is snapshotted onto the unsent
-- event. Later rate changes keep their own notices and never rewrite it.
begin;

alter table public.employee_lifecycle_investor_notification_deliveries
  add column if not exists salary_amount integer check (salary_amount is null or salary_amount > 0),
  add column if not exists salary_unit text check (salary_unit is null or salary_unit in ('daily', 'monthly'));

create or replace function public.snapshot_employee_created_salary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employee_lifecycle_investor_notification_deliveries delivery
  set salary_amount = new.amount,
      salary_unit = new.rate_unit
  where delivery.salary_profile_id = new.salary_profile_id
    and delivery.event_type = 'created'
    and delivery.salary_amount is null
    and delivery.status = 'not_attempted';
  return new;
end;
$$;

revoke all on function public.snapshot_employee_created_salary()
  from public, anon, authenticated;

drop trigger if exists snapshot_employee_created_salary_trigger
  on public.employee_salary_rates;
create trigger snapshot_employee_created_salary_trigger
after insert on public.employee_salary_rates
for each row execute function public.snapshot_employee_created_salary();

commit;

notify pgrst, 'reload schema';
