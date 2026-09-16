-- Track only migrations actually executed through the runner. Do not invent legacy history.
begin;
create table if not exists public.app_schema_migrations (
  filename text primary key check (filename ~ '^[0-9]{3}_[a-z0-9_]+[.]sql$'),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz not null default now()
);
alter table public.app_schema_migrations enable row level security;
revoke all on public.app_schema_migrations from public, anon, authenticated, service_role;
grant select on public.app_schema_migrations to service_role;

-- Read-only catalog metadata for deployment verification; no recipe, payroll or secret data.
create or replace function public.get_database_migration_health()
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'functions', (select coalesce(jsonb_agg(jsonb_build_object('name', p.proname,
      'arguments', oidvectortypes(p.proargtypes), 'md5', md5(p.prosrc))), '[]'::jsonb)
      from pg_proc p where p.pronamespace = 'public'::regnamespace),
    'triggers', (select coalesce(jsonb_agg(jsonb_build_object('name', t.tgname,
      'table', c.relname, 'enabled', t.tgenabled)), '[]'::jsonb)
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relnamespace = 'public'::regnamespace and not t.tgisinternal),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('name', jobname,
      'schedule', schedule, 'active', active)), '[]'::jsonb) from cron.job)
  );
$$;
revoke all on function public.get_database_migration_health() from public, anon, authenticated;
grant execute on function public.get_database_migration_health() to service_role;
notify pgrst, 'reload schema';
commit;
