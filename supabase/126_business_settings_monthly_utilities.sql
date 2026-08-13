-- Monthly utilities plan used by the Accounting monthly estimate.

alter table public.business_settings
  add column if not exists monthly_utilities_uzs bigint not null default 0
    check (monthly_utilities_uzs >= 0);

update public.business_settings
set monthly_utilities_uzs = 0
where id = 'default'
  and monthly_utilities_uzs is null;
