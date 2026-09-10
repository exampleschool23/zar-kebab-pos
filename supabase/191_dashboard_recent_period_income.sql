-- Latest 20 ten-day periods through the selected month; one bounded aggregate.
begin;
create index if not exists dashboard_weekly_paid_at_idx on public.orders (paid_at) where paid_at is not null;
create index if not exists dashboard_weekly_legacy_created_idx on public.orders (created_at) where paid_at is null;

create or replace function public.get_dashboard_recent_period_income(p_month_start date)
returns table (week_start date, week_end date, total_income bigint, day_count integer, average_daily_income bigint)
language plpgsql security definer stable set search_path = public
as $$
declare
  v_today date := timezone('Asia/Tashkent', now())::date;
  v_end date := (p_month_start + interval '1 month')::date;
  v_from_instant timestamptz := (p_month_start - interval '7 months')::timestamp at time zone 'Asia/Tashkent';
  v_to_instant_exclusive timestamptz := least(v_end, v_today)::timestamp at time zone 'Asia/Tashkent';
begin
  if not public.current_staff_can_access('dashboard') then
    raise exception 'Dashboard access is required' using errcode = '42501';
  end if;
  if p_month_start is null or p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'A first-of-month date is required';
  end if;
  return query
  with paid_orders as materialized (

      select ("order".paid_at at time zone 'Asia/Tashkent')::date as business_date, greatest(0, round(coalesce("order".total, 0)::numeric))::bigint as income
      from public.orders "order"
      where "order".status::text is distinct from 'cancelled'
        and "order".payment_status::text is distinct from 'cancelled'
        and "order".paid_at is not null
        and "order".paid_at >= v_from_instant
        and "order".paid_at < v_to_instant_exclusive

      union all

      select ("order".created_at at time zone 'Asia/Tashkent')::date as business_date, greatest(0, round(coalesce("order".total, 0)::numeric))::bigint as income
      from public.orders "order"
      where "order".status::text is distinct from 'cancelled'
        and "order".payment_status::text is distinct from 'cancelled'
        and "order".paid_at is null
        and (
          "order".payment_status::text = 'paid'
          or "order".status::text in ('paid', 'completed')
        )
        and "order".created_at >= v_from_instant
        and "order".created_at < v_to_instant_exclusive
    
  ), weeks as (
    select month_start::date + offset_days as start_date,
      case when offset_days = 20 then (month_start + interval '1 month')::date
        else month_start::date + offset_days + 10 end as end_date
    from generate_series(p_month_start - interval '7 months', p_month_start, interval '1 month') month_start
    cross join generate_series(0, 20, 10) offset_days
    where month_start::date + offset_days < least(v_end, v_today)
    order by start_date desc
    limit 20
  )
  select w.start_date, w.end_date - 1, coalesce(sum(p.income), 0)::bigint,
    greatest(0, least(w.end_date, v_today) - w.start_date),
    case when least(w.end_date, v_today) > w.start_date
      then round(coalesce(sum(p.income), 0)::numeric / (least(w.end_date, v_today) - w.start_date))::bigint
      else 0::bigint end
  from weeks w left join paid_orders p on p.business_date >= w.start_date and p.business_date < w.end_date
  group by w.start_date, w.end_date order by w.start_date;
end;
$$;
revoke all on function public.get_dashboard_recent_period_income(date) from public, anon, authenticated;
grant execute on function public.get_dashboard_recent_period_income(date) to authenticated;
notify pgrst, 'reload schema';
commit;
