-- Effective-dated KPI basis. Existing rules keep migration 195 behavior.
-- No historical result/bonus rows are rewritten and no name matching is used.
begin;

alter table public.employee_kpi_rules
  add column if not exists sales_basis text not null default 'employee_opened_orders'
    check (sales_basis in ('employee_opened_orders', 'restaurant')),
  add column if not exists order_opener_profile_id uuid references public.profiles(id) on delete restrict;

alter table public.employee_kpi_rule_change_events
  add column if not exists previous_sales_basis text,
  add column if not exists new_sales_basis text,
  add column if not exists previous_order_opener_name text,
  add column if not exists new_order_opener_name text;

-- Require an explicit account for newly saved own-order rules when payroll is
-- unlinked. Disabled successors and existing rules remain removable/readable.
create or replace function public.validate_employee_kpi_sales_basis()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_enabled and new.sales_basis = 'employee_opened_orders'
     and new.order_opener_profile_id is null
     and not exists (select 1 from public.employee_salary_profiles
       where id = new.salary_profile_id and profile_id is not null) then
    raise exception 'Select a POS account for own-order KPI';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_employee_kpi_sales_basis_trigger on public.employee_kpi_rules;
create trigger validate_employee_kpi_sales_basis_trigger before insert or update on public.employee_kpi_rules
  for each row execute function public.validate_employee_kpi_sales_basis();
revoke all on function public.validate_employee_kpi_sales_basis() from public, anon, authenticated;

create or replace function public.stamp_employee_kpi_rule_change_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.last_change_event_id := gen_random_uuid();
    return new;
  end if;

  if new.rate_bps is distinct from old.rate_bps
     or new.sales_basis is distinct from old.sales_basis
     or new.order_opener_profile_id is distinct from old.order_opener_profile_id
     or new.is_enabled is distinct from old.is_enabled
     or new.effective_from is distinct from old.effective_from
     or new.salary_profile_id is distinct from old.salary_profile_id then
    new.last_change_event_id := gen_random_uuid();
  elsif new.last_change_event_id is distinct from old.last_change_event_id then
    raise exception 'KPI rule change event identity is managed by the database';
  end if;

  return new;
end;
$$;

create or replace function public.queue_employee_kpi_rule_change_telegram_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_rate_bps integer;
  v_previous_sales_basis text;
  v_previous_opener uuid;
  v_previous_opener_name text;
  v_new_opener_name text;
  v_previous_is_enabled boolean;
  v_has_previous boolean := false;
  v_change_kind text := 'changed';
  v_employee_name text := '';
  v_created_at timestamptz := now();
begin
  if new.created_by is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.rate_bps is not distinct from old.rate_bps
       and new.sales_basis is not distinct from old.sales_basis
       and new.order_opener_profile_id is not distinct from old.order_opener_profile_id
       and new.is_enabled is not distinct from old.is_enabled
       and new.effective_from is not distinct from old.effective_from
       and new.salary_profile_id is not distinct from old.salary_profile_id then
      return new;
    end if;
    v_previous_sales_basis := old.sales_basis;
    v_previous_opener := old.order_opener_profile_id;
    v_previous_rate_bps := old.rate_bps;
    v_previous_is_enabled := old.is_enabled;
    v_has_previous := true;
  else
    select previous_rule.rate_bps, previous_rule.is_enabled, previous_rule.sales_basis, previous_rule.order_opener_profile_id
      into v_previous_rate_bps, v_previous_is_enabled, v_previous_sales_basis, v_previous_opener
      from public.employee_kpi_rules previous_rule
     where previous_rule.salary_profile_id = new.salary_profile_id
       and previous_rule.id <> new.id
       and previous_rule.effective_from <= new.effective_from
     order by previous_rule.effective_from desc,
              previous_rule.created_at desc,
              previous_rule.id desc
     limit 1;
    v_has_previous := found;
    if not v_has_previous then
      v_change_kind := 'added';
      v_previous_rate_bps := null;
      v_previous_is_enabled := null;
    end if;
  end if;

  select coalesce(salary_profile.employee_name, '')
    into v_employee_name
    from public.employee_salary_profiles salary_profile
   where salary_profile.id = new.salary_profile_id;

  select full_name into v_previous_opener_name from public.profiles where id = v_previous_opener;
  select full_name into v_new_opener_name from public.profiles where id = new.order_opener_profile_id;

  insert into public.employee_kpi_rule_change_events (
    id,
    rule_id,
    salary_profile_id,
    employee_name_snapshot,
    change_kind,
    effective_from,
    previous_sales_basis,
    new_sales_basis,
    previous_order_opener_name,
    new_order_opener_name,
    previous_rate_bps,
    previous_is_enabled,
    new_rate_bps,
    new_is_enabled,
    created_by,
    created_by_name,
    created_at
  ) values (
    new.last_change_event_id,
    new.id,
    new.salary_profile_id,
    v_employee_name,
    v_change_kind,
    new.effective_from,
    v_previous_sales_basis,
    new.sales_basis,
    v_previous_opener_name,
    v_new_opener_name,
    case when v_has_previous then v_previous_rate_bps else null end,
    case when v_has_previous then v_previous_is_enabled else null end,
    new.rate_bps,
    new.is_enabled,
    new.created_by,
    new.created_by_name,
    v_created_at
  );

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
    'kpi_rule',
    new.last_change_event_id,
    new.salary_profile_id,
    'not_attempted',
    'Notification request has not started',
    v_created_at,
    'skipped',
    'KPI rule changes notify only the Salary group',
    v_created_at,
    'skipped',
    'KPI rule changes do not notify ZarKebab Team',
    v_created_at
  )
  on conflict (event_type, event_id) do nothing;

  return new;
end;
$$;

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
  v_employee_base bigint := 0;
  v_sales_by_opener jsonb := '{}'::jsonb;
  -- Fixed policy boundary: delayed deployment/catch-up must not move it.
  v_personal_sales boolean;
  v_opener_id uuid;
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

  -- Read eligible sales once so all employee results share the same snapshot.
  with sales_by_opener as (
    select paid_order.opened_by,
      sum(coalesce(paid_order.subtotal, 0)::bigint
        + coalesce(paid_order.service_fee, 0)::bigint) as amount
    from public.orders paid_order
    where coalesce(paid_order.order_type, 'dine_in') = 'dine_in'
      and paid_order.payment_status = 'paid'
      and paid_order.paid_at is not null
      and coalesce(paid_order.status, '') <> 'cancelled'
      and paid_order.paid_at >= v_from_instant
      and paid_order.paid_at < v_to_instant
    group by paid_order.opened_by
  )
  select coalesce(sum(amount), 0),
    coalesce(jsonb_object_agg(opened_by::text, amount)
      filter (where opened_by is not null), '{}'::jsonb)
  into v_sales_base, v_sales_by_opener
  from sales_by_opener;

  for v_rule in
    select distinct on (rule.salary_profile_id)
      rule.id,
      rule.salary_profile_id,
      rule.rate_bps,
      rule.is_enabled,
      rule.sales_basis,
      rule.order_opener_profile_id,
      salary_profile.employee_name,
      salary_profile.profile_id,
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

    -- Match durable account IDs only. Unlinked employees and unattributed
    -- orders must never borrow another employee's sales through a name match.
    v_personal_sales := p_business_date >= date '2026-09-16'
      and v_rule.sales_basis = 'employee_opened_orders';
    v_opener_id := coalesce(v_rule.order_opener_profile_id, v_rule.profile_id);
    v_employee_base := case when v_personal_sales
      then coalesce((v_sales_by_opener ->> v_opener_id::text)::bigint, 0)
      else v_sales_base
    end;

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
    elsif v_employee_base <= 0 then
      v_status := 'skipped_no_sales';
      v_skip_reason := 'No paid dine-in subtotal or service fee was recorded';
    else
      v_bonus_amount_bigint := round(
        v_employee_base::numeric * v_rule.rate_bps::numeric / 10000
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
          'sales_base_amount', v_employee_base,
          'rate_bps', v_rule.rate_bps,
          'sales_basis', case when v_personal_sales then 'employee_opened_orders' else 'restaurant' end,
          'opened_by', case when v_personal_sales then v_opener_id else null end
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
      v_employee_base,
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

revoke all on function public.generate_daily_kpi_bonuses(date)
  from public, anon, authenticated;
grant execute on function public.generate_daily_kpi_bonuses(date) to service_role;

comment on function public.generate_daily_kpi_bonuses(date) is
  'Finalizes a completed Tashkent date; from 2026-09-16 uses the effective rule basis (own opened orders or all dine-in); earlier dates retain restaurant-wide sales.';

notify pgrst, 'reload schema';
commit;
