-- Audit role/status changes and profile deletions.

create table if not exists public.profile_audit (
  id bigserial primary key,
  profile_id uuid,
  actor_id uuid,
  action text not null,
  old_role text,
  new_role text,
  old_status text,
  new_status text,
  old_full_name text,
  old_email text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_profile_audit_profile_id
  on public.profile_audit(profile_id, changed_at desc);

alter table public.profile_audit enable row level security;

drop policy if exists "Owner/Admin: read profile audit" on public.profile_audit;
create policy "Owner/Admin: read profile audit"
  on public.profile_audit for select
  using (public.current_staff_has_role(array['owner','admin']));

drop policy if exists "No direct profile audit writes" on public.profile_audit;
create policy "No direct profile audit writes"
  on public.profile_audit for insert
  with check (false);

create or replace function public.audit_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.profile_audit (
      profile_id, actor_id, action, old_role, old_status, old_full_name, old_email
    ) values (
      old.id, auth.uid(), 'profile_deleted', old.role, old.status, old.full_name, old.email
    );
    return old;
  end if;

  if old.role is distinct from new.role or old.status is distinct from new.status then
    insert into public.profile_audit (
      profile_id, actor_id, action, old_role, new_role, old_status, new_status, old_full_name, old_email
    ) values (
      new.id,
      auth.uid(),
      case
        when old.role is distinct from new.role and old.status is distinct from new.status then 'role_status_changed'
        when old.role is distinct from new.role then 'role_changed'
        else 'status_changed'
      end,
      old.role,
      new.role,
      old.status,
      new.status,
      old.full_name,
      old.email
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_profile_role_changes on public.profiles;
create trigger audit_profile_role_changes
  after update or delete on public.profiles
  for each row
  execute function public.audit_profile_role_changes();
