-- Generate missing provider-facing menu item IDs and prevent later edits.
-- Existing POS/internal IDs remain unchanged.

create or replace function public.generate_menu_item_external_id()
returns text
language sql
as $$
  select 'MI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create or replace function public.set_menu_item_external_id()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.external_id := coalesce(nullif(new.external_id, ''), public.generate_menu_item_external_id());
    return new;
  end if;

  new.external_id := coalesce(nullif(old.external_id, ''), public.generate_menu_item_external_id());
  return new;
end;
$$;

alter table public.menu_items
  alter column external_id set default public.generate_menu_item_external_id();

update public.menu_items
set external_id = public.generate_menu_item_external_id();

create unique index if not exists idx_menu_items_external_id_unique
  on public.menu_items(external_id)
  where external_id <> '';

drop trigger if exists trg_menu_items_external_id on public.menu_items;
create trigger trg_menu_items_external_id
  before insert or update on public.menu_items
  for each row execute function public.set_menu_item_external_id();
