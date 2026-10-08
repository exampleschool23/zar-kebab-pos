-- Daily employee KPI bonuses.
--
-- A configured employee receives their full effective-dated percentage of the
-- restaurant's paid dine-in subtotal plus service fee for a completed
-- Asia/Tashkent business date. The generated bonus is an immediate Accounting
-- expense. Salary-group and Team announcements remain independently retryable,
-- while the employee sees the KPI amount once in the combined daily salary
-- summary instead of receiving a separate private bonus notification.

alter table public.employee_salary_bonuses
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_salary_bonuses_source_type_check'
      and conrelid = 'public.employee_salary_bonuses'::regclass
  ) then
    alter table public.employee_salary_bonuses
      add constraint employee_salary_bonuses_source_type_check
      check (source_type in ('manual', 'daily_kpi'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'employee_salary_bonuses_source_metadata_object_check'
      and conrelid = 'public.employee_salary_bonuses'::regclass
  ) then
    alter table public.employee_salary_bonuses
      add constraint employee_salary_bonuses_source_metadata_object_check
      check (jsonb_typeof(source_metadata) = 'object');
  end if;
end $$;

-- Only the service-role daily finalizer may create an automatic KPI source.
-- Expenses writers can continue to create and manage ordinary bonuses, but
-- cannot impersonate the automatic origin or change a generated payout so it
-- disagrees with its immutable calculation snapshot. Deletion remains allowed
-- and is handled by void_deleted_daily_kpi_bonus() below.
create or replace function public.protect_daily_kpi_bonus_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.source_type = 'daily_kpi' and (
      auth.uid() is not null
      or new.created_by is not null
      or new.created_by_name <> 'Автоматический KPI'
    ) then
      raise exception 'Daily KPI bonuses can be created only by the automatic finalizer';
    end if;
    return new;
  end if;

  if old.source_type = 'daily_kpi' or new.source_type = 'daily_kpi' then
    raise exception 'Generated daily KPI bonuses are immutable; delete the bonus to void it';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_daily_kpi_bonus_source_trigger
  on public.employee_salary_bonuses;
create trigger protect_daily_kpi_bonus_source_trigger
before insert or update on public.employee_salary_bonuses
for each row execute function public.protect_daily_kpi_bonus_source();

create table if not exists public.employee_kpi_rules (
  id                 uuid primary key default gen_random_uuid(),
  salary_profile_id  uuid not null
                     references public.employee_salary_profiles(id) on delete cascade,
  effective_from     date not null default (timezone('Asia/Tashkent', now()))::date,
  rate_bps           integer not null
                     check (rate_bps between 1 and 10000),
  is_enabled         boolean not null default true,
  created_by         uuid references public.profiles(id) on delete set null,
  created_by_name    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint employee_kpi_rules_profile_effective_unique
    unique (salary_profile_id, effective_from)
);

create index if not exists idx_employee_kpi_rules_profile_effective
  on public.employee_kpi_rules(salary_profile_id, effective_from desc, created_at desc);

-- A run row is the date-level finalization boundary. It also records days with
-- zero sales or zero applicable rules, which lets a bounded catch-up loop tell
-- the difference between an empty completed day and a day never processed.
create table if not exists public.employee_daily_kpi_runs (
  business_date       date primary key,
  sales_base_amount   bigint not null default 0
                      check (sales_base_amount >= 0),
  configured_rule_count integer not null default 0
                      check (configured_rule_count >= 0),
  generated_count     integer not null default 0
                      check (generated_count >= 0),
  skipped_count       integer not null default 0
                      check (skipped_count >= 0),
  completed_at        timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create table if not exists public.employee_daily_kpi_results (
  id                     uuid primary key default gen_random_uuid(),
  business_date          date not null,
  salary_profile_id      uuid not null
                         references public.employee_salary_profiles(id) on delete restrict,
  rule_id                uuid not null
                         references public.employee_kpi_rules(id) on delete restrict,
  employee_name_snapshot text not null default '',
  sales_base_amount      bigint not null default 0
                         check (sales_base_amount >= 0),
  rate_bps               integer not null
                         check (rate_bps between 1 and 10000),
  bonus_amount           integer not null default 0
                         check (bonus_amount >= 0),
  payment_method         text not null default 'cash'
                         check (payment_method in ('cash', 'card', 'terminal')),
  status                 text not null
                         check (status in (
                           'generated',
                           'skipped_absent',
                           'skipped_ineligible',
                           'skipped_no_sales',
                           'voided'
                         )),
  skip_reason            text not null default '',
  bonus_id               uuid unique
                         references public.employee_salary_bonuses(id) on delete set null,
  calculated_at          timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  constraint employee_daily_kpi_results_profile_date_unique
    unique (business_date, salary_profile_id),
  constraint employee_daily_kpi_results_generated_bonus_check
    check (
      (status = 'generated' and bonus_id is not null and bonus_amount > 0)
      or
      (status like 'skipped_%' and bonus_id is null and bonus_amount = 0)
      or
      (status = 'voided' and bonus_id is null and bonus_amount > 0)
    )
);

create index if not exists idx_employee_daily_kpi_results_date
  on public.employee_daily_kpi_results(business_date desc, status);

create index if not exists idx_employee_daily_kpi_results_profile
  on public.employee_daily_kpi_results(salary_profile_id, business_date desc);

alter table public.employee_kpi_rules enable row level security;
alter table public.employee_daily_kpi_runs enable row level security;
alter table public.employee_daily_kpi_results enable row level security;

drop policy if exists "expenses_read_employee_kpi_rules"
  on public.employee_kpi_rules;
create policy "expenses_read_employee_kpi_rules"
  on public.employee_kpi_rules for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "expenses_write_employee_kpi_rules"
  on public.employee_kpi_rules;
drop policy if exists "expenses_insert_employee_kpi_rules"
  on public.employee_kpi_rules;
create policy "expenses_insert_employee_kpi_rules"
  on public.employee_kpi_rules for insert
  to authenticated
  with check (public.current_staff_can_write('expenses'));

drop policy if exists "expenses_update_employee_kpi_rules"
  on public.employee_kpi_rules;
create policy "expenses_update_employee_kpi_rules"
  on public.employee_kpi_rules for update
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));

drop policy if exists "owner_delete_employee_kpi_rules"
  on public.employee_kpi_rules;
create policy "owner_delete_employee_kpi_rules"
  on public.employee_kpi_rules for delete
  to authenticated
  using (public.current_staff_has_role(array['owner']));

drop policy if exists "expenses_read_employee_daily_kpi_runs"
  on public.employee_daily_kpi_runs;
create policy "expenses_read_employee_daily_kpi_runs"
  on public.employee_daily_kpi_runs for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "expenses_read_employee_daily_kpi_results"
  on public.employee_daily_kpi_results;
create policy "expenses_read_employee_daily_kpi_results"
  on public.employee_daily_kpi_results for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

revoke all on table public.employee_kpi_rules
  from public, anon, authenticated;
revoke all on table public.employee_daily_kpi_runs
  from public, anon, authenticated;
revoke all on table public.employee_daily_kpi_results
  from public, anon, authenticated;
grant select, insert, update, delete on table public.employee_kpi_rules
  to authenticated;
grant select on table public.employee_daily_kpi_runs
  to authenticated;
grant select on table public.employee_daily_kpi_results
  to authenticated;

-- Once a rule has produced a durable result, preserve the rule identity. The
-- result itself also snapshots every financial input, so later effective-dated
-- rows never rewrite an already paid bonus.
create or replace function public.protect_used_employee_kpi_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.employee_daily_kpi_results result
    where result.rule_id = old.id
  ) then
    raise exception 'A KPI rule used by a finalized day cannot be changed or deleted';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_used_employee_kpi_rule_trigger
  on public.employee_kpi_rules;
create trigger protect_used_employee_kpi_rule_trigger
before update or delete on public.employee_kpi_rules
for each row execute function public.protect_used_employee_kpi_rule();

create or replace function public.protect_daily_kpi_finalization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and current_setting('app.daily_kpi_void_in_progress', true) = 'true' then
    return new;
  end if;
  raise exception 'Finalized daily KPI records are immutable';
end;
$$;

drop trigger if exists protect_employee_daily_kpi_runs_trigger
  on public.employee_daily_kpi_runs;
create trigger protect_employee_daily_kpi_runs_trigger
before update or delete on public.employee_daily_kpi_runs
for each row execute function public.protect_daily_kpi_finalization();

drop trigger if exists protect_employee_daily_kpi_results_trigger
  on public.employee_daily_kpi_results;
create trigger protect_employee_daily_kpi_results_trigger
before update or delete on public.employee_daily_kpi_results
for each row execute function public.protect_daily_kpi_finalization();

-- Automatic bonuses remain correctable through the existing Accounting bonus
-- delete action. Preserve the immutable calculation snapshot, mark it voided,
-- and clear its bonus link before the FK and the existing Telegram cleanup
-- triggers finish deleting the source bonus. A finalized run never regenerates
-- the voided payment on a retry.
create or replace function public.void_deleted_daily_kpi_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.source_type <> 'daily_kpi' then
    return old;
  end if;

  perform set_config('app.daily_kpi_void_in_progress', 'true', true);
  update public.employee_daily_kpi_results
     set status = 'voided',
         bonus_id = null,
         skip_reason = 'Generated KPI bonus was deleted through Accounting'
   where bonus_id = old.id
     and status = 'generated';
  perform set_config('app.daily_kpi_void_in_progress', 'false', true);

  return old;
end;
$$;

drop trigger if exists void_deleted_daily_kpi_bonus_trigger
  on public.employee_salary_bonuses;
create trigger void_deleted_daily_kpi_bonus_trigger
before delete on public.employee_salary_bonuses
for each row execute function public.void_deleted_daily_kpi_bonus();

-- Migration 119 deliberately skipped null-created_by rows. Automatic KPI
-- bonuses have no human creator, but still need database-first tracking for
-- Salary-group and Team delivery. Their employee destination is recorded as a
-- terminal skip because the private KPI amount is included in the combined
-- daily salary summary. Ordinary bonus, fine, and absence rows keep all of
-- their existing independently retryable destinations.
create or replace function public.queue_salary_event_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null
     and coalesce(to_jsonb(new) ->> 'source_type', '') <> 'daily_kpi' then
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
    'not_attempted',
    'Notification request has not started',
    new.created_at,
    case
      when tg_argv[0] = 'bonus'
       and coalesce(to_jsonb(new) ->> 'source_type', '') = 'daily_kpi'
        then 'skipped'
      else 'not_attempted'
    end,
    case
      when tg_argv[0] = 'bonus'
       and coalesce(to_jsonb(new) ->> 'source_type', '') = 'daily_kpi'
        then 'Automatic KPI is included in the combined daily salary summary'
      else 'Notification request has not started'
    end,
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

-- Atomic and idempotent date finalization. The advisory transaction lock and
-- date-level run row are both intentional: the lock serializes simultaneous
-- first attempts, while the run row makes every later retry a read-only replay.
create or replace function public.generate_daily_kpi_bonuses(
  p_business_date date
)
returns setof public.employee_daily_kpi_results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_date date := (timezone('Asia/Tashkent', now()))::date - 1;
  v_from_instant timestamptz;
  v_to_instant timestamptz;
  v_sales_base bigint := 0;
  v_result_id uuid;
  v_bonus_id uuid;
  v_bonus_amount_bigint bigint;
  v_payment_method text;
  v_status text;
  v_skip_reason text;
  v_configured_count integer := 0;
  v_generated_count integer := 0;
  v_skipped_count integer := 0;
  v_rule record;
begin
  if p_business_date is null then
    raise exception 'business date is required';
  end if;
  if p_business_date > v_completed_date then
    raise exception 'KPI bonuses can be generated only for a completed Tashkent date';
  end if;

  perform pg_advisory_xact_lock(hashtext('daily-kpi:' || p_business_date::text));

  if exists (
    select 1
    from public.employee_daily_kpi_runs run
    where run.business_date = p_business_date
  ) then
    return query
      select result.*
      from public.employee_daily_kpi_results result
      where result.business_date = p_business_date
      order by result.employee_name_snapshot, result.salary_profile_id;
    return;
  end if;

  v_from_instant := p_business_date::timestamp at time zone 'Asia/Tashkent';
  v_to_instant := (p_business_date + 1)::timestamp at time zone 'Asia/Tashkent';

  select coalesce(sum(
    coalesce(paid_order.subtotal, 0)::bigint
    + coalesce(paid_order.service_fee, 0)::bigint
  ), 0)
  into v_sales_base
  from public.orders paid_order
  where coalesce(paid_order.order_type, 'dine_in') = 'dine_in'
    and paid_order.payment_status = 'paid'
    and paid_order.paid_at is not null
    and coalesce(paid_order.status, '') <> 'cancelled'
    and paid_order.paid_at >= v_from_instant
    and paid_order.paid_at < v_to_instant;

  for v_rule in
    select distinct on (rule.salary_profile_id)
      rule.id,
      rule.salary_profile_id,
      rule.rate_bps,
      rule.is_enabled,
      salary_profile.employee_name,
      salary_profile.joined_at,
      salary_profile.ended_at,
      salary_profile.deleted_at,
      salary_profile.payment_method
    from public.employee_kpi_rules rule
    join public.employee_salary_profiles salary_profile
      on salary_profile.id = rule.salary_profile_id
    where rule.effective_from <= p_business_date
    order by
      rule.salary_profile_id,
      rule.effective_from desc,
      rule.created_at desc,
      rule.id desc
  loop
    -- A disabled effective row means this employee has no applicable KPI for
    -- the date. Do not create an endless daily stream of disabled audit rows.
    if not v_rule.is_enabled then
      continue;
    end if;

    v_configured_count := v_configured_count + 1;
    v_result_id := gen_random_uuid();
    v_bonus_id := null;
    v_bonus_amount_bigint := 0;
    v_payment_method := case
      when v_rule.payment_method in ('cash', 'card', 'terminal')
        then v_rule.payment_method
      else 'cash'
    end;
    v_status := 'generated';
    v_skip_reason := '';

    if (
         v_rule.deleted_at is not null
         and (timezone('Asia/Tashkent', v_rule.deleted_at))::date <= p_business_date
       )
       or v_rule.joined_at > p_business_date
       or (v_rule.ended_at is not null and v_rule.ended_at < p_business_date) then
      v_status := 'skipped_ineligible';
      v_skip_reason := 'Employee was outside the eligible employment period';
    elsif exists (
      select 1
      from public.employee_salary_absences absence
      where absence.salary_profile_id = v_rule.salary_profile_id
        and absence.absence_date = p_business_date
    ) then
      v_status := 'skipped_absent';
      v_skip_reason := 'Employee was recorded absent for the business date';
    elsif v_sales_base <= 0 then
      v_status := 'skipped_no_sales';
      v_skip_reason := 'No paid dine-in subtotal or service fee was recorded';
    else
      v_bonus_amount_bigint := round(
        v_sales_base::numeric * v_rule.rate_bps::numeric / 10000
      )::bigint;
      if v_bonus_amount_bigint <= 0 then
        v_status := 'skipped_no_sales';
        v_skip_reason := 'The calculated KPI bonus rounded to zero';
        v_bonus_amount_bigint := 0;
      elsif v_bonus_amount_bigint > 2147483647 then
        raise exception 'Calculated KPI bonus exceeds the supported amount for salary profile %',
          v_rule.salary_profile_id;
      end if;
    end if;

    if v_status = 'generated' then
      v_bonus_id := gen_random_uuid();
      insert into public.employee_salary_bonuses (
        id,
        salary_profile_id,
        bonus_date,
        amount,
        payment_method,
        note,
        created_by,
        created_by_name,
        source_type,
        source_metadata
      ) values (
        v_bonus_id,
        v_rule.salary_profile_id,
        p_business_date,
        v_bonus_amount_bigint::integer,
        v_payment_method,
        format(
          'Автоматический ежедневный KPI: %s%% от dine-in продаж с сервисом (%s)',
          trim(to_char(v_rule.rate_bps::numeric / 100, 'FM999990.00')),
          p_business_date::text
        ),
        null,
        'Автоматический KPI',
        'daily_kpi',
        jsonb_build_object(
          'result_id', v_result_id,
          'rule_id', v_rule.id,
          'business_date', p_business_date,
          'sales_base_amount', v_sales_base,
          'rate_bps', v_rule.rate_bps
        )
      );
      v_generated_count := v_generated_count + 1;
    else
      v_skipped_count := v_skipped_count + 1;
    end if;

    insert into public.employee_daily_kpi_results (
      id,
      business_date,
      salary_profile_id,
      rule_id,
      employee_name_snapshot,
      sales_base_amount,
      rate_bps,
      bonus_amount,
      payment_method,
      status,
      skip_reason,
      bonus_id
    ) values (
      v_result_id,
      p_business_date,
      v_rule.salary_profile_id,
      v_rule.id,
      coalesce(v_rule.employee_name, ''),
      v_sales_base,
      v_rule.rate_bps,
      v_bonus_amount_bigint::integer,
      v_payment_method,
      v_status,
      v_skip_reason,
      v_bonus_id
    );
  end loop;

  insert into public.employee_daily_kpi_runs (
    business_date,
    sales_base_amount,
    configured_rule_count,
    generated_count,
    skipped_count
  ) values (
    p_business_date,
    v_sales_base,
    v_configured_count,
    v_generated_count,
    v_skipped_count
  );

  return query
    select result.*
    from public.employee_daily_kpi_results result
    where result.business_date = p_business_date
    order by result.employee_name_snapshot, result.salary_profile_id;
end;
$$;

revoke all on function public.protect_used_employee_kpi_rule()
  from public, anon, authenticated;
revoke all on function public.protect_daily_kpi_bonus_source()
  from public, anon, authenticated;
revoke all on function public.protect_daily_kpi_finalization()
  from public, anon, authenticated;
revoke all on function public.void_deleted_daily_kpi_bonus()
  from public, anon, authenticated;
revoke all on function public.queue_salary_event_telegram_delivery()
  from public, anon, authenticated;
revoke all on function public.generate_daily_kpi_bonuses(date)
  from public, anon, authenticated;
grant execute on function public.generate_daily_kpi_bonuses(date)
  to service_role;

comment on function public.generate_daily_kpi_bonuses(date) is
  'Finalizes one completed Asia/Tashkent date and atomically creates immediate employee bonuses from paid dine-in subtotal plus service fee.';

notify pgrst, 'reload schema';
