-- Keep the current Dashboard month comparable with finalized history by using
-- completed Tashkent calendar days only. Today's still-changing revenue is
-- excluded until the next Tashkent midnight.

begin;

create or replace function public.get_dashboard_monthly_average_income(
  p_month_count integer default 12
)
returns table (
  month_start date,
  total_income bigint,
  day_count smallint,
  average_daily_income bigint,
  order_count integer,
  is_finalized boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today date := timezone('Asia/Tashkent', now())::date;
  v_current_month date := date_trunc('month', timezone('Asia/Tashkent', now()))::date;
  v_from_instant timestamptz := date_trunc('month', timezone('Asia/Tashkent', now())) at time zone 'Asia/Tashkent';
  v_to_instant_exclusive timestamptz := timezone('Asia/Tashkent', now())::date::timestamp at time zone 'Asia/Tashkent';
  v_completed_day_count smallint := greatest(v_today - v_current_month, 0)::smallint;
  v_month_count integer := greatest(1, least(coalesce(p_month_count, 12), 24));
begin
  if not public.current_staff_can_access('dashboard') then
    raise exception 'Dashboard access is required' using errcode = '42501';
  end if;

  return query
    with requested_months as (
      select month_value::date as requested_month
      from generate_series(
        (v_current_month - ((v_month_count - 1) * interval '1 month'))::date,
        v_current_month,
        interval '1 month'
      ) month_value
    ), current_paid_orders as materialized (
      select greatest(0, round(coalesce("order".total, 0)::numeric))::bigint as income
      from public.orders "order"
      where "order".status::text is distinct from 'cancelled'
        and "order".payment_status::text is distinct from 'cancelled'
        and "order".paid_at is not null
        and "order".paid_at >= v_from_instant
        and "order".paid_at < v_to_instant_exclusive

      union all

      select greatest(0, round(coalesce("order".total, 0)::numeric))::bigint as income
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
    ), current_total as (
      select
        coalesce(sum(current_paid_order.income), 0)::bigint as income,
        count(*)::integer as orders
      from current_paid_orders current_paid_order
    )
    select
      requested.requested_month,
      case
        when requested.requested_month = v_current_month then current_total.income
        else coalesce(snapshot.total_income, 0)
      end::bigint,
      case
        when requested.requested_month = v_current_month then v_completed_day_count
        else coalesce(
          snapshot.day_count,
          ((requested.requested_month + interval '1 month')::date - requested.requested_month)::smallint
        )
      end::smallint,
      case
        when requested.requested_month = v_current_month and v_completed_day_count > 0 then
          round(current_total.income::numeric / v_completed_day_count)::bigint
        when requested.requested_month = v_current_month then 0
        else coalesce(snapshot.average_daily_income, 0)
      end::bigint,
      case
        when requested.requested_month = v_current_month then current_total.orders
        else coalesce(snapshot.order_count, 0)
      end::integer,
      (snapshot.month_start is not null)::boolean
    from requested_months requested
    cross join current_total
    left join public.dashboard_monthly_income_snapshots snapshot
      on snapshot.month_start = requested.requested_month
    order by requested.requested_month;
end;
$$;

revoke all on function public.get_dashboard_monthly_average_income(integer)
  from public, anon, authenticated;
grant execute on function public.get_dashboard_monthly_average_income(integer)
  to authenticated;

comment on function public.get_dashboard_monthly_average_income(integer) is
  'Returns finalized monthly averages plus the current month through the last completed Tashkent day.';

commit;
