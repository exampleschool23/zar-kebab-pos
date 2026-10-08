-- Snapshot running daily KPI in future private paid-order notices. No backfill.
begin;
set local lock_timeout = '5s';
create or replace function public.queue_employee_order_kpi_notification()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  business_date date;
  recipient record;
  rate integer;
  base bigint;
  daily_base bigint;
  daily_rate integer;
begin
  if new.payment_status is distinct from 'paid' or old.payment_status='paid'
     or new.paid_at is null or new.opened_by is null or new.status='cancelled' then return new; end if;
  business_date := (new.paid_at at time zone 'Asia/Tashkent')::date;
  for recipient in
    select s.id, r.rate_bps, r.is_enabled, r.sales_basis, l.chat_id
    from employee_salary_profiles s
    left join lateral (select * from employee_kpi_rules k where k.salary_profile_id=s.id
      and k.effective_from<=business_date order by effective_from desc,created_at desc,id desc limit 1) r on true
    join employee_salary_telegram_links l on l.salary_profile_id=s.id
    where coalesce(r.order_opener_profile_id,s.profile_id)=new.opened_by
      and l.notifications_enabled and nullif(btrim(l.chat_id),'') is not null
      and s.joined_at<=business_date and (s.ended_at is null or s.ended_at>=business_date)
      and (s.deleted_at is null or (s.deleted_at at time zone 'Asia/Tashkent')::date>business_date)
  loop
    daily_rate := case when recipient.is_enabled
      and not exists(select 1 from employee_salary_absences a where a.salary_profile_id=recipient.id and a.absence_date=business_date)
      then recipient.rate_bps else 0 end;
    rate := case when coalesce(new.order_type,'dine_in')='dine_in' then daily_rate else 0 end;
    -- Include this payment and every eligible paid order visible at this moment.
    -- Round the daily base once, just like the end-of-day finalizer.
    select coalesce(sum(coalesce(o.subtotal,0)::bigint+coalesce(o.service_fee,0)::bigint),0)
      into daily_base from orders o
      where coalesce(o.order_type,'dine_in')='dine_in'
        and o.payment_status='paid' and coalesce(o.status,'')<>'cancelled'
        and o.paid_at >= business_date::timestamp at time zone 'Asia/Tashkent'
        and o.paid_at < (business_date+1)::timestamp at time zone 'Asia/Tashkent'
        and (business_date < date '2026-09-16' or recipient.sales_basis='restaurant' or o.opened_by=new.opened_by);
    base := coalesce(new.subtotal,0)::bigint+coalesce(new.service_fee,0)::bigint;
    insert into employee_order_kpi_notifications(order_id,salary_profile_id,chat_id,snapshot)
    values(new.id,recipient.id,recipient.chat_id,jsonb_build_object(
      'order_number',new.order_number,'total',new.total,'rate_bps',rate,
      'cut',round(base::numeric*rate/10000),'paid_at',new.paid_at,
      'daily_cut',round(daily_base::numeric*daily_rate/10000)))
    on conflict(order_id,salary_profile_id) do nothing;
  end loop;
  begin
    perform public.invoke_employee_order_kpi_notifications();
  exception when others then
    raise warning 'Employee order notification queued; immediate dispatch failed';
  end;
  return new;
end;
$$;
revoke all on function public.queue_employee_order_kpi_notification() from public,anon,authenticated;
commit;
