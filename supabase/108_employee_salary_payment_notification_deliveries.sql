-- Auditable Telegram delivery and employee receipt confirmation for salary payments.

create table if not exists public.employee_salary_payment_notification_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  payment_id           uuid not null unique
                       references public.employee_salary_payments(id) on delete cascade,
  salary_profile_id    uuid not null
                       references public.employee_salary_profiles(id) on delete cascade,
  status               text not null default 'pending'
                       check (status in ('pending', 'sent', 'failed', 'skipped', 'confirmed')),
  telegram_message_id  text,
  error_message        text not null default '',
  attempted_at         timestamptz not null default now(),
  sent_at              timestamptz,
  confirmed_at         timestamptz,
  confirmed_by_telegram_user_id text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_salary_payment_notification_deliveries_status
  on public.employee_salary_payment_notification_deliveries(created_at desc, status);

alter table public.employee_salary_payment_notification_deliveries enable row level security;

drop policy if exists "expenses_read_salary_payment_notification_deliveries"
  on public.employee_salary_payment_notification_deliveries;
create policy "expenses_read_salary_payment_notification_deliveries"
  on public.employee_salary_payment_notification_deliveries for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

revoke all on table public.employee_salary_payment_notification_deliveries
  from public, anon, authenticated;
grant select on table public.employee_salary_payment_notification_deliveries
  to authenticated;
