-- Employee salary fines reduce payroll liability without creating a cash expense.
-- Every change is retained in the immutable accounting audit trail.

create table if not exists public.employee_salary_fines (
  id                uuid primary key default gen_random_uuid(),
  salary_profile_id uuid not null references public.employee_salary_profiles(id) on delete cascade,
  fine_date         date not null default current_date,
  amount            integer not null check (amount > 0),
  reason            text not null check (length(trim(reason)) > 0),
  created_by        uuid references public.profiles(id) on delete set null,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists idx_employee_salary_fines_profile_date
  on public.employee_salary_fines(salary_profile_id, fine_date desc);

alter table public.employee_salary_fines enable row level security;

drop policy if exists "feature_access_read_employee_salary_fines" on public.employee_salary_fines;
create policy "feature_access_read_employee_salary_fines"
  on public.employee_salary_fines for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "feature_access_write_employee_salary_fines" on public.employee_salary_fines;
create policy "feature_access_write_employee_salary_fines"
  on public.employee_salary_fines for all
  to authenticated
  using (public.current_staff_can_write('expenses'))
  with check (public.current_staff_can_write('expenses'));

revoke all on table public.employee_salary_fines from public;
grant select, insert, update, delete on table public.employee_salary_fines to authenticated;

alter table public.accounting_record_audit
  drop constraint if exists accounting_record_audit_entity_type_check;

alter table public.accounting_record_audit
  add constraint accounting_record_audit_entity_type_check
  check (entity_type in ('expense', 'salary_payment', 'salary_bonus', 'salary_fine'));

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

drop trigger if exists audit_salary_fine_records on public.employee_salary_fines;
create trigger audit_salary_fine_records
after insert or update or delete on public.employee_salary_fines
for each row execute function public.capture_accounting_record_audit();

revoke all on function public.capture_accounting_record_audit() from public;
