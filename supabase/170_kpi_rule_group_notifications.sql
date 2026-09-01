-- Notify the dedicated Salary group whenever a KPI rule is added or genuinely
-- changed. The immutable change event preserves the exact before/after values
-- even when the rule is edited again before a failed Telegram delivery retries.

begin;

alter table public.employee_kpi_rules
  add column if not exists last_change_event_id uuid;

create table if not exists public.employee_kpi_rule_change_events (
  id                     uuid primary key,
  rule_id                uuid
                         references public.employee_kpi_rules(id) on delete set null,
  salary_profile_id      uuid not null
                         references public.employee_salary_profiles(id) on delete cascade,
  employee_name_snapshot text not null default '',
  change_kind            text not null
                         check (change_kind in ('added', 'changed')),
  effective_from         date not null,
  previous_rate_bps      integer,
  previous_is_enabled    boolean,
  new_rate_bps           integer not null,
  new_is_enabled         boolean not null,
  created_by             uuid references public.profiles(id) on delete set null,
  created_by_name        text not null default '',
  created_at             timestamptz not null default now(),
  constraint employee_kpi_rule_change_previous_pair_check
    check (
      (previous_rate_bps is null and previous_is_enabled is null)
      or
      (previous_rate_bps is not null and previous_is_enabled is not null)
    )
);

create index if not exists idx_employee_kpi_rule_change_events_profile_created
  on public.employee_kpi_rule_change_events(salary_profile_id, created_at desc);

alter table public.employee_kpi_rule_change_events enable row level security;

drop policy if exists "expenses_read_employee_kpi_rule_change_events"
  on public.employee_kpi_rule_change_events;
create policy "expenses_read_employee_kpi_rule_change_events"
  on public.employee_kpi_rule_change_events for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

revoke all on table public.employee_kpi_rule_change_events
  from public, anon, authenticated;
grant select on table public.employee_kpi_rule_change_events to authenticated;

alter table public.employee_salary_group_notification_deliveries
  drop constraint if exists employee_salary_group_notification_deliveries_event_type_check;
alter table public.employee_salary_group_notification_deliveries
  add constraint employee_salary_group_notification_deliveries_event_type_check
  check (event_type in ('bonus', 'fine', 'absence', 'rate', 'kpi_rule'));

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
       and new.is_enabled is not distinct from old.is_enabled
       and new.effective_from is not distinct from old.effective_from
       and new.salary_profile_id is not distinct from old.salary_profile_id then
      return new;
    end if;
    v_previous_rate_bps := old.rate_bps;
    v_previous_is_enabled := old.is_enabled;
    v_has_previous := true;
  else
    select previous_rule.rate_bps, previous_rule.is_enabled
      into v_previous_rate_bps, v_previous_is_enabled
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

  insert into public.employee_kpi_rule_change_events (
    id,
    rule_id,
    salary_profile_id,
    employee_name_snapshot,
    change_kind,
    effective_from,
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

drop trigger if exists stamp_employee_kpi_rule_change_event_trigger
  on public.employee_kpi_rules;
create trigger stamp_employee_kpi_rule_change_event_trigger
before insert or update on public.employee_kpi_rules
for each row execute function public.stamp_employee_kpi_rule_change_event();

drop trigger if exists queue_employee_kpi_rule_change_telegram_delivery_trigger
  on public.employee_kpi_rules;
create trigger queue_employee_kpi_rule_change_telegram_delivery_trigger
after insert or update on public.employee_kpi_rules
for each row execute function public.queue_employee_kpi_rule_change_telegram_delivery();

revoke all on function public.stamp_employee_kpi_rule_change_event()
  from public, anon, authenticated;
revoke all on function public.queue_employee_kpi_rule_change_telegram_delivery()
  from public, anon, authenticated;

comment on table public.employee_kpi_rule_change_events is
  'Immutable before/after snapshots used for duplicate-safe Salary-group KPI configuration notifications.';

notify pgrst, 'reload schema';

commit;
