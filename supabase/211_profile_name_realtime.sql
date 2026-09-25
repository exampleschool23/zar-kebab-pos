-- Active-order display names follow profile renames; historical snapshots stay intact.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
    ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
