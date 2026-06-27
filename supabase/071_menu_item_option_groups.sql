-- Product option/variant definitions for menu items.
-- The admin UI stores one required variant group with localized option names.

alter table public.menu_items
  add column if not exists option_groups jsonb not null default '[]'::jsonb;

update public.menu_items
set option_groups = '[]'::jsonb
where option_groups is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_items_option_groups_array'
  ) then
    alter table public.menu_items
      add constraint menu_items_option_groups_array
      check (jsonb_typeof(option_groups) = 'array')
      not valid;
  end if;
end $$;

alter table public.menu_items
  validate constraint menu_items_option_groups_array;
