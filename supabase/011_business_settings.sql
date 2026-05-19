-- ============================================================
-- Zar Kebab POS — Shared business settings
-- Stores service rate and receipt settings in Supabase instead of per-device localStorage.
-- ============================================================

create table if not exists public.business_settings (
  id               text primary key default 'default',
  restaurant_name  text not null default 'Zar Kebab',
  service_rate_pct integer not null default 20
                   check (service_rate_pct between 0 and 100),
  receipt_footer   text not null default 'Thank you for visiting!',
  auto_print       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into public.business_settings (id, restaurant_name, service_rate_pct, receipt_footer, auto_print)
values ('default', 'Zar Kebab', 20, 'Thank you for visiting!', false)
on conflict (id) do nothing;

alter table public.business_settings enable row level security;

drop policy if exists "Public: read business settings" on public.business_settings;
create policy "Public: read business settings"
  on public.business_settings for select
  using (true);

drop policy if exists "Owner/Admin: update business settings" on public.business_settings;
create policy "Owner/Admin: update business settings"
  on public.business_settings for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('owner', 'admin')
    )
  );

drop policy if exists "Owner/Admin: insert business settings" on public.business_settings;
create policy "Owner/Admin: insert business settings"
  on public.business_settings for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('owner', 'admin')
    )
  );

