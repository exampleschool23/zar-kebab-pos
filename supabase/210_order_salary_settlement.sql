-- Non-cash order settlement against payroll; loyalty remains server-authoritative.
begin;
alter table public.order_payments drop constraint order_payments_method_check;
alter table public.order_payments add constraint order_payments_method_check
  check (method in ('cash','card','terminal','qr','loyalty_card','other','salary'));
alter table public.employee_salary_payments drop constraint employee_salary_payments_payment_method_check;
alter table public.employee_salary_payments add constraint employee_salary_payments_payment_method_check
  check (payment_method in ('cash','card','terminal','salary'));

create table public.order_salary_settlements (
  request_id uuid primary key,
  actor_id uuid not null,
  salary_profile_id uuid not null references public.employee_salary_profiles(id),
  payment_id uuid not null unique,
  request jsonb not null,
  order_ids text[] not null,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.order_salary_settlements enable row level security;
revoke all on public.order_salary_settlements from public, anon, authenticated;

-- Return only employee choices, never payroll rates or ledgers to cashier users.
create function public.get_order_salary_employees()
returns table(id uuid, employee_name text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.current_staff_can_write('delete_paid_orders') then
    raise exception 'Delete completed orders access is required' using errcode='42501';
  end if;
  return query select p.id, p.employee_name from public.employee_salary_profiles p
    where p.is_active and p.deleted_at is null order by p.employee_name, p.id;
end $$;
revoke all on function public.get_order_salary_employees() from public, anon;
grant execute on function public.get_order_salary_employees() to authenticated;

-- Preserve all previous settlement fixes and wallet calculations.
alter function public.settle_orders_payment(jsonb) rename to settle_orders_payment_before_salary;
revoke all on function public.settle_orders_payment_before_salary(jsonb) from public, anon, authenticated;
do $$
declare signature text; definition text;
begin
  foreach signature in array array['public.settle_orders_payment_before_salary(jsonb)', 'public.settle_orders_payment_strict(jsonb)'] loop
    definition := pg_get_functiondef(to_regprocedure(signature));
    if position('if not public.current_staff_can_write(''cashier'') then' in definition)=0 then
      raise exception 'Unexpected settlement permission contract: %', signature;
    end if;
    definition := replace(definition, 'if not public.current_staff_can_write(''cashier'') then',
      'if not public.current_staff_can_write(''cashier'') and not (payload ? ''salary_profile_id'' and public.current_staff_can_write(''delete_paid_orders'')) then');
    if signature like '%strict%' then
      if position('''cash'', ''card'', ''terminal'', ''qr'', ''other''' in definition)=0 then
        raise exception 'Unexpected settlement methods';
      end if;
      definition := replace(definition, '''cash'', ''card'', ''terminal'', ''qr'', ''other''',
        '''cash'', ''card'', ''terminal'', ''qr'', ''other'', ''salary''');
    end if;
    execute definition;
  end loop;
end $$;

create function public.settle_orders_payment(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
<<settlement>>
declare
  receipt public.order_salary_settlements%rowtype;
  employee public.employee_salary_profiles%rowtype;
  request_id uuid;
  payment_id uuid := gen_random_uuid();
  expected_ids text[];
  settled_ids text[];
  result jsonb;
  amount integer;
  actor_name text;
begin
  if not (payload ? 'salary_profile_id') then
    if exists(select 1 from jsonb_array_elements(payload->'payments') p where p->>'method'='salary') then
      raise exception 'Salary settlement requires an employee' using errcode='22023';
    end if;
    return public.settle_orders_payment_before_salary(payload);
  end if;
  if not public.current_staff_can_write('delete_paid_orders') then
    raise exception 'Delete completed orders access is required' using errcode='42501';
  end if;
  request_id := (payload->>'request_id')::uuid;
  if request_id is null then raise exception 'Request identity is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('salary-settlement:' || request_id,0));
  select * into receipt from public.order_salary_settlements s where s.request_id=settlement.request_id;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.request<>payload then
      raise exception 'Settlement request changed' using errcode='22023';
    end if;
    return receipt.result;
  end if;
  select * into employee from public.employee_salary_profiles p
    where p.id=(payload->>'salary_profile_id')::uuid and p.is_active and p.deleted_at is null for update;
  if not found then raise exception 'Active employee not found'; end if;
  if jsonb_array_length(payload->'payments')<>1 or payload->'payments'->0->>'method'<>'salary' then
    raise exception 'Salary must cover the balance after loyalty';
  end if;
  if coalesce(payload->'payments'->0->>'amount','') !~ '^[0-9]+$' then
    raise exception 'Salary amount must be a whole UZS integer' using errcode='22023';
  end if;
  amount := (payload->'payments'->0->>'amount')::integer;
  if amount is null or amount<=0 then raise exception 'Positive salary deduction required'; end if;
  select array_agg(value order by value) into expected_ids from jsonb_array_elements_text(payload->'expected_order_ids');
  if coalesce(cardinality(expected_ids),0)=0 then raise exception 'Expected orders are required'; end if;
  insert into public.order_salary_settlements(request_id,actor_id,salary_profile_id,payment_id,request,order_ids)
    values(request_id,auth.uid(),employee.id,payment_id,payload,expected_ids);
  result := public.settle_orders_payment_before_salary(payload);
  select array_agg(value order by value) into settled_ids from jsonb_array_elements_text(result->'order_ids');
  if settled_ids is distinct from expected_ids then
    raise exception 'The bill changed. Refresh and review it again.' using errcode='40001';
  end if;
  select coalesce(nullif(full_name,''),email,'Staff') into actor_name from public.profiles where id=auth.uid();
  insert into public.employee_salary_payments(id,salary_profile_id,paid_date,amount,payment_method,note,created_by,created_by_name)
    values(payment_id,employee.id,(now() at time zone 'Asia/Tashkent')::date,amount,'salary',
      'Order: ' || (select string_agg(coalesce(nullif(o.order_number,''),o.id), ', ' order by o.id) from public.orders o where o.id=any(settled_ids)),
      auth.uid(),actor_name);
  update public.employee_salary_payment_notification_deliveries d
    set group_status='skipped', group_error_message='Salary deductions notify the employee and order statuses chat'
    where d.payment_id=settlement.payment_id;
  result := result || jsonb_build_object('salary_payment_id',payment_id);
  update public.order_salary_settlements s set result=settlement.result where s.request_id=settlement.request_id;
  return result;
end $$;
revoke all on function public.settle_orders_payment(jsonb) from public, anon;
grant execute on function public.settle_orders_payment(jsonb) to authenticated;

-- Block independent edits/deletes and forged non-cash payroll entries.
create function public.guard_order_salary_settlement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='employee_salary_payments' then
    if tg_op='INSERT' then
      if new.payment_method='salary' and not exists(select 1 from public.order_salary_settlements s
        where s.payment_id=new.id and s.salary_profile_id=new.salary_profile_id and s.actor_id=new.created_by
          and (s.request->'payments'->0->>'amount')::integer=new.amount and s.result is null) then
        raise exception 'Salary order payments require atomic settlement';
      end if;
      return new;
    end if;
    if old.payment_method='salary' or (tg_op='UPDATE' and new.payment_method='salary') then
      raise exception 'Linked salary order payments cannot be edited or deleted independently';
    end if;
  elsif tg_table_name='order_payments' then
    if tg_op='INSERT' then
      if new.method='salary' and not exists(select 1 from public.order_salary_settlements s
        where new.order_id=any(s.order_ids) and s.actor_id=auth.uid() and s.result is null) then
        raise exception 'Salary tender requires atomic settlement';
      end if;
      return new;
    end if;
    if old.method='salary' or (tg_op='UPDATE' and new.method='salary') then
      raise exception 'Linked salary tender cannot be corrected independently';
    end if;
  else
    if exists(select 1 from public.order_salary_settlements s where old.id=any(s.order_ids) and s.result is not null) then
      if tg_op='DELETE' or new.payment_method is distinct from old.payment_method
        or new.payment_status is distinct from old.payment_status or new.status is distinct from old.status then
        raise exception 'Salary-covered orders require a linked payroll reversal before deletion or correction';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_salary_order_payroll before insert or update or delete on public.employee_salary_payments
  for each row execute function public.guard_order_salary_settlement();
create trigger guard_salary_order_tender before insert or update or delete on public.order_payments
  for each row execute function public.guard_order_salary_settlement();
create trigger guard_salary_order before update or delete on public.orders
  for each row execute function public.guard_order_salary_settlement();

-- Show a distinct non-cash bucket alongside existing tender aggregates.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.get_accounting_paid_order_summary(date,date)'::regprocedure);
  if position('''cash'', ''card'', ''terminal'', ''qr'', ''loyalty_card''' in definition)=0 then
    raise exception 'Unexpected Accounting methods contract';
  end if;
  definition := replace(definition, '''cash'', ''card'', ''terminal'', ''qr'', ''loyalty_card''',
    '''cash'', ''card'', ''terminal'', ''qr'', ''loyalty_card'', ''salary''');
  definition := replace(definition, '''payment_method_income'', jsonb_build_object(',
    '''payment_method_income'', jsonb_build_object(''salary'', coalesce((select amount from payment_totals where method = ''salary''), 0),');
  execute definition;
end $$;
notify pgrst, 'reload schema';
commit;
