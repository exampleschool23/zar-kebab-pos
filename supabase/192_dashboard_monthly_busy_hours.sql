-- Twelve compact two-hour buckets for one Tashkent month.
begin;
create or replace function public.get_dashboard_monthly_busy_hours(p_month_start date)
returns table (period_start_hour integer, order_count bigint)
language plpgsql security definer stable set search_path = public
as $$
declare
  v_current_month date := date_trunc('month', timezone('Asia/Tashkent', now()))::date;
  v_month_end date;
  v_from timestamptz;
  v_to timestamptz;
begin
  if not public.current_staff_can_access('dashboard') then raise exception 'Dashboard access is required' using errcode = '42501'; end if;
  if p_month_start is null or p_month_start <> date_trunc('month', p_month_start)::date or p_month_start > v_current_month then raise exception 'A current or past first-of-month date is required'; end if;
  v_month_end := (p_month_start + interval '1 month')::date;
  v_from := p_month_start::timestamp at time zone 'Asia/Tashkent';
  v_to := least(v_month_end, timezone('Asia/Tashkent', now())::date + 1)::timestamp at time zone 'Asia/Tashkent';
  return query
  with periods as (select generate_series(0, 22, 2)::integer as start_hour), paid_orders as materialized (
    select extract(hour from "order".paid_at at time zone 'Asia/Tashkent')::integer as paid_hour from public.orders "order"
    where "order".status::text is distinct from 'cancelled' and "order".payment_status::text is distinct from 'cancelled' and "order".paid_at >= v_from and "order".paid_at < v_to
    union all
    select extract(hour from "order".created_at at time zone 'Asia/Tashkent')::integer from public.orders "order"
    where "order".status::text is distinct from 'cancelled' and "order".payment_status::text is distinct from 'cancelled' and "order".paid_at is null
      and ("order".payment_status::text = 'paid' or "order".status::text in ('paid', 'completed')) and "order".created_at >= v_from and "order".created_at < v_to
  )
  select period.start_hour, count(paid_order.paid_hour)::bigint from periods period
  left join paid_orders paid_order on paid_order.paid_hour >= period.start_hour and paid_order.paid_hour < period.start_hour + 2
  group by period.start_hour order by period.start_hour;
end;
$$;
revoke all on function public.get_dashboard_monthly_busy_hours(date) from public, anon, authenticated;
grant execute on function public.get_dashboard_monthly_busy_hours(date) to authenticated;
notify pgrst, 'reload schema';
commit;
