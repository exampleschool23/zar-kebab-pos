-- From 2026-09-16 (Tashkent business date), KPI uses each employee's own
-- opened orders. Earlier dates retain the restaurant-wide calculation.
-- Existing finalized runs/results/bonuses are never rewritten.

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
  v_personal_sales boolean := p_business_date >= date '2026-09-16';
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
    v_employee_base := case when v_personal_sales
      then coalesce((v_sales_by_opener ->> v_rule.profile_id::text)::bigint, 0)
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
          'opened_by', case when v_personal_sales then v_rule.profile_id else null end
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
  'Finalizes a completed Tashkent date; from 2026-09-16 uses paid dine-in subtotal plus service for orders opened by the employee, with earlier dates retaining restaurant-wide sales.';

notify pgrst, 'reload schema';
