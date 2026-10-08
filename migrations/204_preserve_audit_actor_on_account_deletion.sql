-- Audit actor IDs are historical snapshots, just like changed_by_name.
-- A live-profile FK with SET NULL mutates immutable history during auth deletion.
-- Keep the ID and every audit snapshot unchanged after the account is removed.
begin;
alter table public.accounting_record_audit
  drop constraint if exists accounting_record_audit_changed_by_fkey;
comment on column public.accounting_record_audit.changed_by is
  'Historical actor UUID. Intentionally not a live profile foreign key: account deletion must not rewrite immutable audit records.';
commit;
