-- Separate the configured dine-in service rate for Tourist pricing from the
-- Regular rate. Orders continue to snapshot the selected rate in
-- orders.service_rate_pct, so later setting changes never rewrite history.

alter table public.business_settings
  alter column service_rate_pct set default 15;

alter table public.business_settings
  add column if not exists tourist_service_rate_pct integer;

alter table public.business_settings
  alter column tourist_service_rate_pct set default 20;

update public.business_settings
set tourist_service_rate_pct = 20
where tourist_service_rate_pct is null;

alter table public.business_settings
  alter column tourist_service_rate_pct set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'business_settings_tourist_service_rate_pct_range'
      and conrelid = 'public.business_settings'::regclass
  ) then
    alter table public.business_settings
      add constraint business_settings_tourist_service_rate_pct_range
      check (tourist_service_rate_pct between 0 and 100);
  end if;
end
$$;

notify pgrst, 'reload schema';
