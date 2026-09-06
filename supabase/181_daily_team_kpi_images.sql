-- One claimed Team KPI image per finalized business date. Private summaries stay separate.
begin;
create table public.daily_team_kpi_image_deliveries (
  business_date date primary key,
  status text not null check (status in ('sending', 'sent', 'editing', 'legacy')),
  chat_id text,
  telegram_message_id text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.daily_team_kpi_image_deliveries enable row level security;
revoke all on public.daily_team_kpi_image_deliveries from anon, authenticated;
grant all on public.daily_team_kpi_image_deliveries to service_role;
-- Do not rebroadcast dates already delivered by the former per-employee path.
insert into public.daily_team_kpi_image_deliveries (business_date, status)
select distinct b.bonus_date, 'legacy'
from public.employee_salary_bonuses b
join public.employee_salary_group_notification_deliveries d
  on d.event_type = 'bonus' and d.event_id = b.id
where b.source_type = 'daily_kpi' and d.team_status = 'sent'
on conflict do nothing;
commit;
