-- Private Telegram salary notifications for employees.
-- Employees link themselves with a short-lived, single-use deep-link token.

create table if not exists public.employee_salary_telegram_links (
  salary_profile_id     uuid primary key references public.employee_salary_profiles(id) on delete cascade,
  telegram_user_id      text unique,
  chat_id               text unique,
  username              text not null default '',
  preferred_language    text not null default 'ru'
                        check (preferred_language in ('uz', 'ru', 'en')),
  notifications_enabled boolean not null default true,
  link_token            uuid unique,
  link_token_expires_at timestamptz,
  linked_at              timestamptz,
  last_notified_at       timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_employee_salary_telegram_links_token
  on public.employee_salary_telegram_links(link_token)
  where link_token is not null;

create table if not exists public.employee_salary_notification_deliveries (
  id                uuid primary key default gen_random_uuid(),
  salary_profile_id uuid not null references public.employee_salary_profiles(id) on delete cascade,
  notification_date date not null,
  notification_type text not null default 'daily_salary'
                    check (notification_type in ('daily_salary')),
  status            text not null default 'pending'
                    check (status in ('pending', 'sent', 'failed', 'skipped')),
  telegram_message_id text,
  error_message     text not null default '',
  attempted_at      timestamptz not null default now(),
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (salary_profile_id, notification_date, notification_type)
);

create index if not exists idx_employee_salary_notification_deliveries_date
  on public.employee_salary_notification_deliveries(notification_date desc, status);

alter table public.employee_salary_telegram_links enable row level security;
alter table public.employee_salary_notification_deliveries enable row level security;

drop policy if exists "expenses_read_employee_salary_telegram_links"
  on public.employee_salary_telegram_links;
create policy "expenses_read_employee_salary_telegram_links"
  on public.employee_salary_telegram_links for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

drop policy if exists "expenses_read_employee_salary_notification_deliveries"
  on public.employee_salary_notification_deliveries;
create policy "expenses_read_employee_salary_notification_deliveries"
  on public.employee_salary_notification_deliveries for select
  to authenticated
  using (public.current_staff_can_access('expenses'));

revoke all on table public.employee_salary_telegram_links from public, anon, authenticated;
revoke all on table public.employee_salary_notification_deliveries from public, anon, authenticated;
grant select on table public.employee_salary_telegram_links to authenticated;
grant select on table public.employee_salary_notification_deliveries to authenticated;

create or replace function public.create_employee_salary_telegram_link(
  target_salary_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_token uuid := gen_random_uuid();
begin
  if not public.current_staff_can_write('expenses') then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.employee_salary_profiles salary_profile
    where salary_profile.id = target_salary_profile_id
      and salary_profile.deleted_at is null
  ) then
    raise exception 'Employee salary profile not found';
  end if;

  insert into public.employee_salary_telegram_links (
    salary_profile_id,
    link_token,
    link_token_expires_at,
    updated_at
  ) values (
    target_salary_profile_id,
    generated_token,
    now() + interval '30 minutes',
    now()
  )
  on conflict (salary_profile_id) do update set
    link_token = excluded.link_token,
    link_token_expires_at = excluded.link_token_expires_at,
    updated_at = now();

  return generated_token::text;
end;
$$;

revoke all on function public.create_employee_salary_telegram_link(uuid) from public, anon;
grant execute on function public.create_employee_salary_telegram_link(uuid) to authenticated;
