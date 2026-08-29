-- Monthly average-daily-income snapshots for the Dashboard.
--
-- Completed months are frozen once so the Dashboard never needs to fetch or
-- aggregate their order rows again. The read RPC combines those snapshots with
-- a live aggregate for the current, incomplete Tashkent month only.

begin;

create table if not exists public.dashboard_monthly_income_snapshots (
  month_start                 date primary key,
  total_income                bigint not null default 0
                              check (total_income >= 0),
  day_count                   smallint not null
                              check (day_count between 28 and 31),
  average_daily_income        bigint not null default 0
                              check (average_daily_income >= 0),
  order_count                 integer not null default 0
                              check (order_count >= 0),
  source_type                 text not null default 'month_end_finalizer'
                              check (source_type in ('legacy_backfill', 'month_end_finalizer')),
  finalized_at                timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  constraint dashboard_monthly_income_month_start_check
    check (month_start = date_trunc('month', month_start)::date),
  constraint dashboard_monthly_income_average_check
    check (average_daily_income = round(total_income::numeric / day_count)::bigint)
);

alter table public.dashboard_monthly_income_snapshots enable row level security;

drop policy if exists "dashboard_read_monthly_income_snapshots"
  on public.dashboard_monthly_income_snapshots;
create policy "dashboard_read_monthly_income_snapshots"
  on public.dashboard_monthly_income_snapshots for select
  to authenticated
  using (public.current_staff_can_access('dashboard'));

revoke all on table public.dashboard_monthly_income_snapshots
  from public, anon, authenticated;
grant select on table public.dashboard_monthly_income_snapshots
  to authenticated;

create or replace function public.protect_dashboard_monthly_income_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Finalized Dashboard monthly income snapshots are immutable';
end;
$$;

drop trigger if exists protect_dashboard_monthly_income_snapshot_trigger
  on public.dashboard_monthly_income_snapshots;
create trigger protect_dashboard_monthly_income_snapshot_trigger
before update or delete on public.dashboard_monthly_income_snapshots
for each row execute function public.protect_dashboard_monthly_income_snapshot();

create or replace function public.finalize_dashboard_monthly_income(
  p_month_start date
)
returns setof public.dashboard_monthly_income_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_month date := date_trunc('month', timezone('Asia/Tashkent', now()))::date;
  v_month_end_exclusive date;
  v_from_instant timestamptz;
  v_to_instant_exclusive timestamptz;
  v_day_count smallint;
  v_total_income bigint := 0;
  v_order_count integer := 0;
begin
  if p_month_start is null
    or p_month_start <> date_trunc('month', p_month_start)::date
  then
    raise exception 'A first-of-month date is required';
  end if;

  if p_month_start >= v_current_month then
    raise exception 'Only completed Tashkent months can be finalized';
  end if;

  perform pg_advisory_xact_lock(hashtext('dashboard-monthly-income:' || p_month_start::text));

  if exists (
    select 1
    from public.dashboard_monthly_income_snapshots snapshot
    where snapshot.month_start = p_month_start
  ) then
    return query
      select snapshot.*
      from public.dashboard_monthly_income_snapshots snapshot
      where snapshot.month_start = p_month_start;
    return;
  end if;

  v_month_end_exclusive := (p_month_start + interval '1 month')::date;
  v_from_instant := p_month_start::timestamp at time zone 'Asia/Tashkent';
  v_to_instant_exclusive := v_month_end_exclusive::timestamp at time zone 'Asia/Tashkent';
  v_day_count := (v_month_end_exclusive - p_month_start)::smallint;

  select
    coalesce(sum(paid_order.income), 0)::bigint,
    count(*)::integer
  into v_total_income, v_order_count
  from (
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
  ) paid_order;

  insert into public.dashboard_monthly_income_snapshots (
    month_start,
    total_income,
    day_count,
    average_daily_income,
    order_count,
    source_type
  ) values (
    p_month_start,
    v_total_income,
    v_day_count,
    round(v_total_income::numeric / v_day_count)::bigint,
    v_order_count,
    'month_end_finalizer'
  )
  on conflict (month_start) do nothing;

  return query
    select snapshot.*
    from public.dashboard_monthly_income_snapshots snapshot
    where snapshot.month_start = p_month_start;
end;
$$;

revoke all on function public.finalize_dashboard_monthly_income(date)
  from public, anon, authenticated;
grant execute on function public.finalize_dashboard_monthly_income(date)
  to service_role;

-- Freeze all existing completed history once. This is the only migration-time
-- order-history scan; future Dashboard reads use these rows directly.
with current_boundary as (
  select date_trunc('month', timezone('Asia/Tashkent', now()))::date as current_month
), paid_orders as materialized (
  select
    ("order".paid_at at time zone 'Asia/Tashkent')::date as business_date,
    greatest(0, round(coalesce("order".total, 0)::numeric))::bigint as income
  from public.orders "order"
  where "order".status::text is distinct from 'cancelled'
    and "order".payment_status::text is distinct from 'cancelled'
    and "order".paid_at is not null

  union all

  select
    ("order".created_at at time zone 'Asia/Tashkent')::date as business_date,
    greatest(0, round(coalesce("order".total, 0)::numeric))::bigint as income
  from public.orders "order"
  where "order".status::text is distinct from 'cancelled'
    and "order".payment_status::text is distinct from 'cancelled'
    and "order".paid_at is null
    and (
      "order".payment_status::text = 'paid'
      or "order".status::text in ('paid', 'completed')
    )
), bounds as (
  select
    least(
      coalesce(
        date_trunc('month', min(paid_order.business_date))::date,
        (current_boundary.current_month - interval '11 months')::date
      ),
      (current_boundary.current_month - interval '11 months')::date
    ) as first_month,
    (current_boundary.current_month - interval '1 month')::date as last_month
  from current_boundary
  left join paid_orders paid_order on true
  group by current_boundary.current_month
), months as (
  select month_value::date as month_start
  from bounds
  cross join lateral generate_series(
    bounds.first_month,
    bounds.last_month,
    interval '1 month'
  ) month_value
  where bounds.first_month <= bounds.last_month
), monthly_totals as (
  select
    date_trunc('month', paid_order.business_date)::date as month_start,
    sum(paid_order.income)::bigint as total_income,
    count(*)::integer as order_count
  from paid_orders paid_order
  cross join current_boundary
  where paid_order.business_date < current_boundary.current_month
  group by date_trunc('month', paid_order.business_date)::date
)
insert into public.dashboard_monthly_income_snapshots (
  month_start,
  total_income,
  day_count,
  average_daily_income,
  order_count,
  source_type
)
select
  month.month_start,
  coalesce(monthly_total.total_income, 0),
  ((month.month_start + interval '1 month')::date - month.month_start)::smallint,
  round(
    coalesce(monthly_total.total_income, 0)::numeric
    / ((month.month_start + interval '1 month')::date - month.month_start)
  )::bigint,
  coalesce(monthly_total.order_count, 0),
  'legacy_backfill'
from months month
left join monthly_totals monthly_total
  on monthly_total.month_start = month.month_start
on conflict (month_start) do nothing;

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
  v_to_instant_exclusive timestamptz := (date_trunc('month', timezone('Asia/Tashkent', now())) + interval '1 month') at time zone 'Asia/Tashkent';
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
        when requested.requested_month = v_current_month then (v_today - v_current_month + 1)::smallint
        else coalesce(
          snapshot.day_count,
          ((requested.requested_month + interval '1 month')::date - requested.requested_month)::smallint
        )
      end::smallint,
      case
        when requested.requested_month = v_current_month then
          round(current_total.income::numeric / (v_today - v_current_month + 1))::bigint
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

create or replace function public.finalize_previous_dashboard_monthly_income()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_month date := (
    date_trunc('month', timezone('Asia/Tashkent', now())) - interval '1 month'
  )::date;
begin
  perform 1
  from public.finalize_dashboard_monthly_income(v_previous_month);
end;
$$;

revoke all on function public.finalize_previous_dashboard_monthly_income()
  from public, anon, authenticated;
grant execute on function public.finalize_previous_dashboard_monthly_income()
  to service_role;

-- Run daily at 01:10 Asia/Tashkent. On the first day of a month this freezes
-- the month that just ended; later runs are constant-time no-ops because the
-- immutable snapshot already exists. The daily retry makes the finalizer heal
-- automatically after a transient cron outage.
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'zar-kebab-monthly-income-snapshot'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'zar-kebab-monthly-income-snapshot',
    '10 20 * * *',
    'select public.finalize_previous_dashboard_monthly_income();'
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
