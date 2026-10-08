-- Freeze the mutable inputs used by financial reports.
--
-- 1. Employee meals become one immutable completed-day record. The migration
--    freezes the legacy calculation once with the currently configured rate;
--    later setting changes affect only dates finalized after the change.
-- 2. Sold items snapshot their category so moving a product never rewrites
--    historical category reports.
-- 3. KPI rules cannot be backdated into an already finalized period, and the
--    cron can ask the database for every outstanding date instead of relying
--    on a permanently bounded lookback window.

begin;

create table if not exists public.employee_daily_meal_expenses (
  business_date              date primary key,
  average_daily_amount       integer not null default 0
                             check (average_daily_amount >= 0),
  present_employee_count     integer not null default 0
                             check (present_employee_count >= 0),
  total_amount               bigint not null default 0
                             check (total_amount >= 0),
  source_type                text not null default 'daily_finalizer'
                             check (source_type in ('legacy_backfill', 'daily_finalizer')),
  finalized_at               timestamptz not null default now(),
  created_at                 timestamptz not null default now(),
  constraint employee_daily_meal_expenses_total_check
    check (total_amount = average_daily_amount::bigint * present_employee_count::bigint)
);

alter table public.employee_daily_meal_expenses enable row level security;

drop policy if exists "expenses_read_employee_daily_meal_expenses"
  on public.employee_daily_meal_expenses;
create policy "expenses_read_employee_daily_meal_expenses"
  on public.employee_daily_meal_expenses for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

revoke all on table public.employee_daily_meal_expenses
  from public, anon, authenticated;
grant select on table public.employee_daily_meal_expenses
  to authenticated;

create or replace function public.protect_employee_daily_meal_expense()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Finalized employee meal expenses are immutable';
end;
$$;

drop trigger if exists protect_employee_daily_meal_expenses_trigger
  on public.employee_daily_meal_expenses;
create trigger protect_employee_daily_meal_expenses_trigger
before update or delete on public.employee_daily_meal_expenses
for each row execute function public.protect_employee_daily_meal_expense();

create or replace function public.generate_employee_daily_meal_expense(
  p_business_date date
)
returns setof public.employee_daily_meal_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_date date := (timezone('Asia/Tashkent', now()))::date - 1;
  v_average_daily_amount integer := 0;
  v_present_employee_count integer := 0;
begin
  if p_business_date is null then
    raise exception 'business date is required';
  end if;
  if p_business_date > v_completed_date then
    raise exception 'Employee meals can be finalized only for a completed Tashkent date';
  end if;

  perform pg_advisory_xact_lock(hashtext('daily-employee-meal:' || p_business_date::text));

  if exists (
    select 1
    from public.employee_daily_meal_expenses meal
    where meal.business_date = p_business_date
  ) then
    return query
      select meal.*
      from public.employee_daily_meal_expenses meal
      where meal.business_date = p_business_date;
    return;
  end if;

  select greatest(0, coalesce(settings.average_daily_employee_meal_uzs, 0))
    into v_average_daily_amount
  from public.business_settings settings
  where settings.id = 'default';

  v_average_daily_amount := coalesce(v_average_daily_amount, 0);

  select count(*)::integer
    into v_present_employee_count
  from public.employee_salary_profiles salary_profile
  where salary_profile.joined_at <= p_business_date
    and (salary_profile.ended_at is null or salary_profile.ended_at >= p_business_date)
    and not (
      salary_profile.is_active = false
      and salary_profile.ended_at is null
    )
    -- ended_at is inclusive, so a profile removed on its final working date
    -- remains present for that date too.
    and (
      salary_profile.deleted_at is null
      or (timezone('Asia/Tashkent', salary_profile.deleted_at))::date > p_business_date
      or salary_profile.ended_at = p_business_date
    )
    and not exists (
      select 1
      from public.employee_salary_absences absence
      where absence.salary_profile_id = salary_profile.id
        and absence.absence_date = p_business_date
    );

  insert into public.employee_daily_meal_expenses (
    business_date,
    average_daily_amount,
    present_employee_count,
    total_amount,
    source_type
  ) values (
    p_business_date,
    v_average_daily_amount,
    v_present_employee_count,
    v_average_daily_amount::bigint * v_present_employee_count::bigint,
    'daily_finalizer'
  );

  return query
    select meal.*
    from public.employee_daily_meal_expenses meal
    where meal.business_date = p_business_date;
end;
$$;

-- Freeze the previous calculated behavior once. There is no historical meal
-- rate ledger before this migration, so the current setting is the only
-- recoverable legacy input. Future changes never touch these rows.
with bounds as (
  select
    least(
      coalesce(min(salary_profile.joined_at), (timezone('Asia/Tashkent', now()))::date - 1),
      (timezone('Asia/Tashkent', now()))::date - 1
    ) as first_date,
    (timezone('Asia/Tashkent', now()))::date - 1 as last_date
  from public.employee_salary_profiles salary_profile
), settings as (
  select greatest(0, coalesce(business.average_daily_employee_meal_uzs, 0))::integer as daily_amount
  from public.business_settings business
  where business.id = 'default'
), dates as (
  select day::date as business_date
  from bounds
  cross join lateral generate_series(bounds.first_date, bounds.last_date, interval '1 day') day
), attendance as (
  select
    dates.business_date,
    count(salary_profile.id)::integer as present_employee_count
  from dates
  left join public.employee_salary_profiles salary_profile
    on salary_profile.joined_at <= dates.business_date
   and (salary_profile.ended_at is null or salary_profile.ended_at >= dates.business_date)
   and not (salary_profile.is_active = false and salary_profile.ended_at is null)
   and (
     salary_profile.deleted_at is null
     or (timezone('Asia/Tashkent', salary_profile.deleted_at))::date > dates.business_date
     or salary_profile.ended_at = dates.business_date
   )
   and not exists (
     select 1
     from public.employee_salary_absences absence
     where absence.salary_profile_id = salary_profile.id
       and absence.absence_date = dates.business_date
   )
  group by dates.business_date
)
insert into public.employee_daily_meal_expenses (
  business_date,
  average_daily_amount,
  present_employee_count,
  total_amount,
  source_type
)
select
  attendance.business_date,
  coalesce(settings.daily_amount, 0),
  attendance.present_employee_count,
  coalesce(settings.daily_amount, 0)::bigint * attendance.present_employee_count::bigint,
  'legacy_backfill'
from attendance
left join settings on true
on conflict (business_date) do nothing;

-- deleted_at is an exclusive employment boundary. Keep the employee's chosen
-- inclusive ended_at date eligible for salary, KPI, and meals, while ordinary
-- catalog queries still archive the profile immediately because deleted_at is
-- non-null.
create or replace function public.normalize_salary_profile_deleted_boundary()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null and new.ended_at is not null then
    new.deleted_at := (new.ended_at + 1)::timestamp at time zone 'Asia/Tashkent';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_salary_profile_deleted_boundary_trigger
  on public.employee_salary_profiles;
create trigger normalize_salary_profile_deleted_boundary_trigger
before insert or update on public.employee_salary_profiles
for each row execute function public.normalize_salary_profile_deleted_boundary();

update public.employee_salary_profiles salary_profile
set deleted_at = (salary_profile.ended_at + 1)::timestamp at time zone 'Asia/Tashkent'
where salary_profile.deleted_at is not null
  and salary_profile.ended_at is not null
  and (timezone('Asia/Tashkent', salary_profile.deleted_at))::date <= salary_profile.ended_at;

create or replace function public.get_pending_daily_kpi_dates(
  p_limit integer default 31
)
returns table (business_date date)
language sql
security definer
stable
set search_path = public
as $$
  with bounds as (
    select
      coalesce(
        (select min(rule.effective_from) from public.employee_kpi_rules rule),
        completed.completed_date
      ) as first_date,
      completed.completed_date
    from (select (timezone('Asia/Tashkent', now()))::date - 1 as completed_date) completed
  ), missing as (
    select day::date as business_date
    from bounds
    cross join lateral generate_series(bounds.first_date, bounds.completed_date, interval '1 day') day
    left join public.employee_daily_kpi_runs run
      on run.business_date = day::date
    where run.business_date is null
  )
  select missing.business_date
  from missing, bounds
  order by
    case when missing.business_date = bounds.completed_date then 0 else 1 end,
    missing.business_date
  limit greatest(1, least(coalesce(p_limit, 31), 366));
$$;

-- Meal finalization has its own recovery queue. A KPI run may already exist
-- for a date whose meal snapshot failed, and restaurants without KPI rules
-- still need every completed employee-meal day to heal automatically.
create or replace function public.get_pending_employee_meal_dates(
  p_limit integer default 31
)
returns table (business_date date)
language sql
security definer
stable
set search_path = public
as $$
  with bounds as (
    select
      least(
        coalesce(
          (select min(salary_profile.joined_at) from public.employee_salary_profiles salary_profile),
          completed.completed_date
        ),
        completed.completed_date
      ) as first_date,
      completed.completed_date
    from (select (timezone('Asia/Tashkent', now()))::date - 1 as completed_date) completed
  ), missing as (
    select day::date as business_date
    from bounds
    cross join lateral generate_series(bounds.first_date, bounds.completed_date, interval '1 day') day
    left join public.employee_daily_meal_expenses meal
      on meal.business_date = day::date
    where meal.business_date is null
  )
  select missing.business_date
  from missing, bounds
  order by
    case when missing.business_date = bounds.completed_date then 0 else 1 end,
    missing.business_date
  limit greatest(1, least(coalesce(p_limit, 31), 366));
$$;

create or replace function public.protect_kpi_rule_finalized_period()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.employee_daily_kpi_runs run
    where run.business_date >= new.effective_from
  ) then
    raise exception 'KPI rule effective date must be after the latest finalized KPI date';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_kpi_rule_finalized_period_trigger
  on public.employee_kpi_rules;
create trigger protect_kpi_rule_finalized_period_trigger
before insert or update on public.employee_kpi_rules
for each row execute function public.protect_kpi_rule_finalized_period();

alter table public.order_items
  add column if not exists category_id_snapshot text,
  add column if not exists category_snapshot_captured boolean not null default false;

-- Paid order rows are normally (and correctly) update-locked. Preserve the
-- trigger's exact prior enabled state while performing this one-time snapshot
-- backfill, and restore it even if the update fails.
do $$
declare
  paid_order_items_guard_state text := null;
begin
  select trigger.tgenabled::text
    into paid_order_items_guard_state
  from pg_trigger as trigger
  where trigger.tgrelid = 'public.order_items'::regclass
    and trigger.tgname = 'guard_paid_order_items'
    and not trigger.tgisinternal
  limit 1;

  if paid_order_items_guard_state in ('O', 'R', 'A') then
    execute 'alter table public.order_items disable trigger guard_paid_order_items';
  end if;

  update public.order_items sold_item
  set
    category_id_snapshot = menu_item.category_id,
    category_snapshot_captured = true
  from public.menu_items menu_item
  where menu_item.id = sold_item.menu_item_id
    and sold_item.category_snapshot_captured = false;

  if paid_order_items_guard_state = 'O' then
    execute 'alter table public.order_items enable trigger guard_paid_order_items';
  elsif paid_order_items_guard_state = 'R' then
    execute 'alter table public.order_items enable replica trigger guard_paid_order_items';
  elsif paid_order_items_guard_state = 'A' then
    execute 'alter table public.order_items enable always trigger guard_paid_order_items';
  end if;
exception
  when others then
    if paid_order_items_guard_state = 'O' then
      execute 'alter table public.order_items enable trigger guard_paid_order_items';
    elsif paid_order_items_guard_state = 'R' then
      execute 'alter table public.order_items enable replica trigger guard_paid_order_items';
    elsif paid_order_items_guard_state = 'A' then
      execute 'alter table public.order_items enable always trigger guard_paid_order_items';
    end if;
    raise;
end $$;

create index if not exists idx_order_items_category_snapshot
  on public.order_items(category_id_snapshot);

create or replace function public.snapshot_order_item_category()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select menu_item.category_id
    into new.category_id_snapshot
  from public.menu_items menu_item
  where menu_item.id = new.menu_item_id;
  new.category_snapshot_captured := true;
  return new;
end;
$$;

create or replace function public.protect_order_item_category_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.menu_item_id is distinct from old.menu_item_id then
    select menu_item.category_id
      into new.category_id_snapshot
    from public.menu_items menu_item
    where menu_item.id = new.menu_item_id;
    new.category_snapshot_captured := true;
    return new;
  end if;
  if new.category_id_snapshot is distinct from old.category_id_snapshot
    or new.category_snapshot_captured is distinct from old.category_snapshot_captured
  then
    raise exception 'Order item category snapshots are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_snapshot_category_trigger
  on public.order_items;
create trigger order_items_snapshot_category_trigger
before insert on public.order_items
for each row execute function public.snapshot_order_item_category();

drop trigger if exists order_items_protect_category_snapshot_trigger
  on public.order_items;
create trigger order_items_protect_category_snapshot_trigger
before update of menu_item_id, category_id_snapshot, category_snapshot_captured on public.order_items
for each row execute function public.protect_order_item_category_snapshot();

revoke all on function public.protect_employee_daily_meal_expense()
  from public, anon, authenticated;
revoke all on function public.generate_employee_daily_meal_expense(date)
  from public, anon, authenticated;
grant execute on function public.generate_employee_daily_meal_expense(date)
  to service_role;
revoke all on function public.get_pending_daily_kpi_dates(integer)
  from public, anon, authenticated;
grant execute on function public.get_pending_daily_kpi_dates(integer)
  to service_role;
revoke all on function public.get_pending_employee_meal_dates(integer)
  from public, anon, authenticated;
grant execute on function public.get_pending_employee_meal_dates(integer)
  to service_role;
revoke all on function public.protect_kpi_rule_finalized_period()
  from public, anon, authenticated;
revoke all on function public.normalize_salary_profile_deleted_boundary()
  from public, anon, authenticated;
revoke all on function public.snapshot_order_item_category()
  from public, anon, authenticated;
revoke all on function public.protect_order_item_category_snapshot()
  from public, anon, authenticated;

comment on table public.employee_daily_meal_expenses is
  'Immutable completed-day employee meal expense snapshots used by Accounting and Reports.';
comment on column public.order_items.category_id_snapshot is
  'Menu category captured when the order item is created; historical category reports never read the current product category.';
comment on column public.order_items.category_snapshot_captured is
  'Distinguishes a deliberately snapshotted uncategorized item from a legacy row that still requires its one-time backfill.';

commit;

notify pgrst, 'reload schema';
