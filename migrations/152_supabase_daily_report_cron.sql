-- Schedule the existing duplicate-safe daily report endpoint from Supabase.
--
-- Before applying this migration, store the same CRON_SECRET used by Vercel:
--
--   select vault.create_secret(
--     '<the Vercel CRON_SECRET value>',
--     'zar_kebab_daily_report_cron_secret',
--     'Bearer token used by the Zar Kebab daily report cron'
--   );
--
-- The schedule is UTC. 20:00 UTC is 01:00 the next day in Asia/Tashkent.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_zar_kebab_daily_reports()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into cron_secret
  from vault.decrypted_secrets
  where name = 'zar_kebab_daily_report_cron_secret'
  order by created_at desc
  limit 1;

  if nullif(btrim(cron_secret), '') is null then
    raise exception 'Missing Vault secret: zar_kebab_daily_report_cron_secret';
  end if;

  select net.http_get(
    url := 'https://www.zarkebab.uz/api/telegram/daily-salary',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Accept', 'application/json',
      'User-Agent', 'Zar-Kebab-Supabase-Cron/1.0'
    ),
    timeout_milliseconds := 300000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_zar_kebab_daily_reports() from public;
revoke all on function public.invoke_zar_kebab_daily_reports() from anon;
revoke all on function public.invoke_zar_kebab_daily_reports() from authenticated;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'zar-kebab-daily-reports'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'zar-kebab-daily-reports',
    '0 20 * * *',
    'select public.invoke_zar_kebab_daily_reports();'
  );
end;
$$;
