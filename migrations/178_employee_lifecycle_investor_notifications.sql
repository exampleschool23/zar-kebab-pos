-- Queue immutable, duplicate-safe Investor notifications for employee creation,
-- activation, and deactivation. The UI requests delivery only after its complete
-- workflow succeeds; the trigger ensures every real lifecycle transition has one event.

begin;

create table if not exists public.employee_lifecycle_investor_notification_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  event_type            text not null check (event_type in ('created', 'activated', 'deactivated')),
  salary_profile_id     uuid not null references public.employee_salary_profiles(id) on delete cascade,
  employee_name         text not null,
  effective_date        date not null,
  actor_id              uuid references public.profiles(id) on delete set null,
  actor_name            text not null,
  target_key            text not null default 'salary_events',
  status                text not null default 'not_attempted'
                        check (status in ('not_attempted', 'pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id      text,
  telegram_message_id   text,
  error_message         text not null default 'Notification request has not started',
  attempted_at          timestamptz,
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.employee_lifecycle_investor_notification_deliveries enable row level security;
revoke all on table public.employee_lifecycle_investor_notification_deliveries from public, anon, authenticated;

create index if not exists idx_employee_lifecycle_investor_delivery_status
  on public.employee_lifecycle_investor_notification_deliveries(status, attempted_at, created_at desc);

create index if not exists idx_employee_lifecycle_investor_delivery_profile
  on public.employee_lifecycle_investor_notification_deliveries(salary_profile_id, event_type, created_at desc);

create or replace function public.queue_employee_lifecycle_investor_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
begin
  -- Service and migration writes have no staff identity and must not create alerts.
  if v_actor_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.deleted_at is not null then return new; end if;
    v_event_type := 'created';
  elsif old.is_active is distinct from new.is_active then
    v_event_type := case when new.is_active is false then 'deactivated' else 'activated' end;
  else
    return new;
  end if;

  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), 'Система')
    into v_actor_name
  from public.profiles
  where id = v_actor_id;

  insert into public.employee_lifecycle_investor_notification_deliveries (
    event_type,
    salary_profile_id,
    employee_name,
    effective_date,
    actor_id,
    actor_name
  ) values (
    v_event_type,
    new.id,
    coalesce(nullif(btrim(new.employee_name), ''), 'Без имени'),
    case
      when v_event_type = 'created' then new.joined_at
      when v_event_type = 'deactivated' then coalesce(new.ended_at, (now() at time zone 'Asia/Tashkent')::date)
      else (now() at time zone 'Asia/Tashkent')::date
    end,
    v_actor_id,
    coalesce(v_actor_name, 'Система')
  );

  return new;
end;
$$;

revoke all on function public.queue_employee_lifecycle_investor_notification()
  from public, anon, authenticated;

drop trigger if exists queue_employee_lifecycle_investor_notification_trigger
  on public.employee_salary_profiles;
create trigger queue_employee_lifecycle_investor_notification_trigger
after insert or update of is_active on public.employee_salary_profiles
for each row execute function public.queue_employee_lifecycle_investor_notification();

commit;

notify pgrst, 'reload schema';
