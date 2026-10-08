-- One configured salary-events group plus duplicate-safe delivery history for
-- bonus, fine, and absence notifications. Salary payment group delivery
-- remains in the payment-specific table because it also tracks employee
-- receipt confirmation.

create table if not exists public.telegram_notification_targets (
  target_key   text primary key,
  chat_id      text not null,
  language     text not null default 'ru'
               check (language in ('uz', 'ru', 'en')),
  is_enabled   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into public.telegram_notification_targets (
  target_key,
  chat_id,
  language,
  is_enabled
) values (
  'salary_events',
  '-1003915715160',
  'ru',
  true
)
on conflict (target_key) do nothing;

create table if not exists public.employee_salary_group_notification_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  event_type            text not null
                          check (event_type in ('bonus', 'fine', 'absence')),
  event_id              uuid not null,
  salary_profile_id     uuid not null
                          references public.employee_salary_profiles(id) on delete cascade,
  status                text not null default 'pending'
                          check (status in ('pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id      text,
  telegram_message_id   text,
  error_message         text not null default '',
  attempted_at          timestamptz not null default now(),
  sent_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (event_type, event_id)
);

create index if not exists idx_salary_group_deliveries_status
  on public.employee_salary_group_notification_deliveries(
    attempted_at desc,
    status
  );

alter table public.telegram_notification_targets enable row level security;
alter table public.employee_salary_group_notification_deliveries enable row level security;

drop policy if exists "expenses_read_telegram_notification_targets"
  on public.telegram_notification_targets;
create policy "expenses_read_telegram_notification_targets"
  on public.telegram_notification_targets for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "expenses_read_salary_group_notification_deliveries"
  on public.employee_salary_group_notification_deliveries;
create policy "expenses_read_salary_group_notification_deliveries"
  on public.employee_salary_group_notification_deliveries for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

revoke all on table public.telegram_notification_targets
  from public, anon, authenticated;
revoke all on table public.employee_salary_group_notification_deliveries
  from public, anon, authenticated;
grant select on table public.telegram_notification_targets to authenticated;
grant select on table public.employee_salary_group_notification_deliveries to authenticated;
