-- Same-day absence corrections change payroll liability, so retain their full
-- accounting audit history. Telegram delivery cleanup is handled separately by
-- migration 124.

alter table public.accounting_record_audit
  drop constraint if exists accounting_record_audit_entity_type_check;

alter table public.accounting_record_audit
  add constraint accounting_record_audit_entity_type_check
  check (entity_type in (
    'expense',
    'salary_payment',
    'salary_bonus',
    'salary_fine',
    'salary_absence'
  ));

create or replace function public.capture_accounting_record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text;
  v_entity_id text;
  v_actor_name text := '';
begin
  v_entity_type := case tg_table_name
    when 'expenses' then 'expense'
    when 'employee_salary_payments' then 'salary_payment'
    when 'employee_salary_bonuses' then 'salary_bonus'
    when 'employee_salary_fines' then 'salary_fine'
    when 'employee_salary_absences' then 'salary_absence'
    else null
  end;

  if v_entity_type is null then
    raise exception 'Unsupported accounting audit table: %', tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    v_entity_id := to_jsonb(old) ->> 'id';
  else
    v_entity_id := to_jsonb(new) ->> 'id';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), '')
  into v_actor_name
  from public.profiles p
  where p.id = auth.uid();

  insert into public.accounting_record_audit (
    entity_type,
    entity_id,
    action,
    old_record,
    new_record,
    changed_by,
    changed_by_name
  ) values (
    v_entity_type,
    v_entity_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid(),
    coalesce(v_actor_name, '')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_salary_absence_records
  on public.employee_salary_absences;
create trigger audit_salary_absence_records
after insert or update or delete on public.employee_salary_absences
for each row execute function public.capture_accounting_record_audit();

revoke all on function public.capture_accounting_record_audit() from public;
