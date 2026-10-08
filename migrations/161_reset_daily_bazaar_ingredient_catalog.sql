-- Start the admin-managed ingredient catalog from a clean list without
-- deleting any historical Daily Bazaar purchases or their line snapshots.
begin;

alter table public.bazaar_product_catalog
  add column if not exists is_catalog_managed boolean not null default false;

-- Rows previously generated from free-text purchase history stay in the
-- database for compatibility, but disappear from management and selection.
update public.bazaar_product_catalog
set is_catalog_managed = false;

create or replace function public.mark_bazaar_catalog_managed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.daily_bazaar_catalog_rpc', true) = 'on' then
    if not public.current_staff_can_manage_bazaar_ingredients() then
      raise exception 'Only an owner can manage Daily Bazaar ingredients';
    end if;
    new.is_catalog_managed := true;
  elsif tg_op = 'UPDATE' then
    new.is_catalog_managed := old.is_catalog_managed;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_bazaar_catalog_managed on public.bazaar_product_catalog;
create trigger mark_bazaar_catalog_managed
before insert or update on public.bazaar_product_catalog
for each row execute function public.mark_bazaar_catalog_managed();

create or replace function public.require_bazaar_catalog_ingredient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ingredient public.bazaar_product_catalog%rowtype;
begin
  select *
  into ingredient
  from public.bazaar_product_catalog as catalog
  where catalog.product_key = new.product_key
    and catalog.is_catalog_managed
    and catalog.is_active;

  if not found then
    raise exception 'Choose an active ingredient from the Daily Bazaar catalog';
  end if;

  new.product_name := ingredient.product_name;
  new.category := ingredient.category;
  new.unit := ingredient.unit;
  return new;
end;
$$;

revoke all on function public.mark_bazaar_catalog_managed() from public, anon, authenticated;
revoke all on function public.require_bazaar_catalog_ingredient() from public, anon, authenticated;

commit;
