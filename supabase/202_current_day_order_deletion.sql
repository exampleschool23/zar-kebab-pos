-- Historical orders cannot be deleted by any application role, including owner.
begin;
set local lock_timeout = '5s';

create function public.guard_current_day_order_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_business_date date := (coalesce(old.paid_at, old.created_at) at time zone 'Asia/Tashkent')::date;
begin
  -- Serialize with generate_daily_kpi_bonuses. A deletion begun before midnight
  -- must commit before the next day's finalizer takes its sales snapshot.
  perform pg_advisory_xact_lock(hashtext('daily-kpi:' || v_business_date::text));
  if v_business_date is distinct from (clock_timestamp() at time zone 'Asia/Tashkent')::date
      or exists (select 1 from public.employee_daily_kpi_runs r where r.business_date = v_business_date) then
    raise exception 'Only orders from today (Asia/Tashkent) can be deleted, including by owners'
      using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_current_day_order_deletion() from public, anon, authenticated;
-- A table trigger also covers direct deletes and security-definer RPCs.
create trigger guard_current_day_order_deletion before delete on public.orders
  for each row execute function public.guard_current_day_order_deletion();

alter table public.employee_order_kpi_notifications
  add column delete_requested boolean not null default false,
  add column deleted_at timestamptz,
  add column cleanup_attempted_at timestamptz,
  add column cleanup_error text not null default '';
alter table public.employee_order_kpi_notifications
  drop constraint employee_order_kpi_notifications_status_check;
alter table public.employee_order_kpi_notifications
  add constraint employee_order_kpi_notifications_status_check
  check (status in ('queued', 'processing', 'sent', 'cancelled'));
create index employee_order_kpi_notifications_cleanup
  on public.employee_order_kpi_notifications(cleanup_attempted_at)
  where delete_requested and deleted_at is null and telegram_message_id is not null;

create function public.queue_deleted_employee_order_kpi_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.employee_order_kpi_notifications
    set delete_requested = true,
        status = case when status = 'queued' then 'cancelled' else status end
    where order_id = old.id;
  -- Processing sends retain their claim: a late saved receipt is cleaned up.
  return old;
end;
$$;
revoke all on function public.queue_deleted_employee_order_kpi_notifications() from public, anon, authenticated;
create trigger queue_deleted_employee_order_kpi_notifications after delete on public.orders
  for each row execute function public.queue_deleted_employee_order_kpi_notifications();

-- Repair notices orphaned before this migration without touching payroll history.
update public.employee_order_kpi_notifications n
  set delete_requested = true,
      status = case when status = 'queued' then 'cancelled' else status end
  where not exists (select 1 from public.orders o where o.id = n.order_id);

create or replace function public.invoke_employee_order_kpi_notifications()
returns bigint language plpgsql security definer
set search_path = public, vault, extensions, pg_temp as $$
declare
  cron_secret text;
  request_id bigint;
begin
  if not exists (
    select 1 from public.employee_order_kpi_notifications
    where (status = 'queued' and not delete_requested)
       or (delete_requested and deleted_at is null and telegram_message_id is not null)
  ) then return null; end if;
  select decrypted_secret into cron_secret from vault.decrypted_secrets
    where name = 'zar_kebab_daily_report_cron_secret' order by created_at desc limit 1;
  if nullif(btrim(cron_secret), '') is null then return null; end if;
  select net.http_get(
    url := 'https://www.zarkebab.uz/api/telegram/daily-salary?task=employee-order-kpi',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 60000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.invoke_employee_order_kpi_notifications() from public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
