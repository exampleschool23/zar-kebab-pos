-- Allow owners to add ingredient categories beyond the built-in list.
-- Custom categories are stored inline as 'custom:<name>' (1-60 trimmed chars)
-- so every reader, including Telegram images, can label them without a lookup.
-- Built-in keys stay lowercase; custom names keep their original casing.
-- Historical purchase lines are unchanged.
begin;

create or replace function public.normalize_bazaar_category(raw_category text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when btrim(coalesce(raw_category, '')) ~* '^custom:'
      then 'custom:' || btrim(regexp_replace(substr(btrim(raw_category), 8), '\s+', ' ', 'g'))
    else lower(btrim(coalesce(raw_category, '')))
  end
$$;

create or replace function public.is_valid_bazaar_category(category text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    category in (
      'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery',
      'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'
    )
    or (
      category like 'custom:%'
      and char_length(category) between 8 and 67
      and substr(category, 8) = btrim(substr(category, 8))
    ),
    false
  )
$$;

alter table public.bazaar_product_catalog
  drop constraint if exists bazaar_product_catalog_category_check;
alter table public.bazaar_product_catalog
  add constraint bazaar_product_catalog_category_check
    check (public.is_valid_bazaar_category(category));

alter table public.bazaar_purchase_items
  drop constraint if exists bazaar_purchase_items_category_check;
alter table public.bazaar_purchase_items
  add constraint bazaar_purchase_items_category_check
    check (public.is_valid_bazaar_category(category));

-- Patch the two RPCs in place so their other validation, audit, and expense
-- behavior stays exactly as deployed.
do $migration$
declare
  definition text;
  patched text;
begin
  definition := pg_get_functiondef('public.save_bazaar_ingredient(jsonb)'::regprocedure);
  if position('is_valid_bazaar_category' in definition) = 0 then
    patched := replace(
      definition,
      'lower(btrim(coalesce(payload ->> ''category'', '''')))',
      'public.normalize_bazaar_category(payload ->> ''category'')'
    );
    patched := regexp_replace(
      patched,
      'ingredient_category not in \([^)]*\)',
      'not public.is_valid_bazaar_category(ingredient_category)'
    );
    if patched = definition
      or position('normalize_bazaar_category' in patched) = 0
      or position('is_valid_bazaar_category' in patched) = 0 then
      raise exception 'Unexpected save_bazaar_ingredient definition';
    end if;
    execute patched;
  end if;

  definition := pg_get_functiondef('public.save_bazaar_purchase(jsonb)'::regprocedure);
  if position('is_valid_bazaar_category' in definition) = 0 then
    patched := replace(
      definition,
      'lower(btrim(coalesce(item_value ->> ''category'', '''')))',
      'public.normalize_bazaar_category(item_value ->> ''category'')'
    );
    patched := regexp_replace(
      patched,
      'category_value not in \([^)]*\)',
      'not public.is_valid_bazaar_category(category_value)'
    );
    if patched = definition
      or position('normalize_bazaar_category' in patched) = 0
      or position('is_valid_bazaar_category' in patched) = 0 then
      raise exception 'Unexpected save_bazaar_purchase definition';
    end if;
    execute patched;
  end if;
end;
$migration$;

commit;
