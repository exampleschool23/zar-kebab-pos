-- Allow owner edits to ingredient names without rewriting historical snapshots.
begin;

create or replace function public.save_bazaar_ingredient(payload jsonb)
returns public.bazaar_product_catalog
language plpgsql
security definer
set search_path = public
as $$
declare
  ingredient_key text;
  ingredient_name text;
  ingredient_category text;
  ingredient_unit text;
  ingredient_price bigint;
  existing_ingredient public.bazaar_product_catalog%rowtype;
  saved_ingredient public.bazaar_product_catalog%rowtype;
begin
  if not public.current_staff_can_manage_bazaar_ingredients() then
    raise exception 'Only an owner can manage Daily Bazaar ingredients';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Ingredient payload must be an object';
  end if;

  ingredient_name := btrim(coalesce(payload ->> 'product_name', ''));
  ingredient_category := lower(btrim(coalesce(payload ->> 'category', '')));
  ingredient_unit := lower(btrim(coalesce(payload ->> 'unit', '')));

  if ingredient_name = '' or char_length(ingredient_name) > 160 then
    raise exception 'Ingredient name is required';
  end if;
  if ingredient_category not in (
    'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery',
    'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'
  ) then
    raise exception 'Ingredient category is invalid';
  end if;
  if ingredient_unit not in (
    'kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'bag', 'bottle', 'bunch'
  ) then
    raise exception 'Ingredient unit is invalid';
  end if;
  if coalesce(payload ->> 'normal_unit_price', '') !~ '^[0-9]+$' then
    raise exception 'Normal unit price is required';
  end if;
  ingredient_price := (payload ->> 'normal_unit_price')::bigint;
  if ingredient_price <= 0 or ingredient_price > 2147483647 then
    raise exception 'Normal unit price is out of range';
  end if;

  ingredient_key := nullif(btrim(payload ->> 'product_key'), '');
  if ingredient_key is null then
    ingredient_key := public.normalize_bazaar_product_key(ingredient_name);
  else
    select * into existing_ingredient
    from public.bazaar_product_catalog
    where product_key = ingredient_key
    for update;
    if not found then
      raise exception 'Daily Bazaar ingredient not found';
    end if;
    -- Keep the original key for purchase and Tech Card references when renaming.
  end if;

  perform set_config('app.daily_bazaar_catalog_rpc', 'on', true);

  insert into public.bazaar_product_catalog (
    product_key, product_name, category, unit, normal_unit_price,
    is_active, last_purchase_date, created_at, updated_at
  ) values (
    ingredient_key, ingredient_name, ingredient_category, ingredient_unit,
    ingredient_price::integer, true, current_date, now(), now()
  )
  on conflict (product_key) do update
  set product_name = excluded.product_name,
      category = excluded.category,
      unit = excluded.unit,
      normal_unit_price = excluded.normal_unit_price,
      is_active = true,
      updated_at = now()
  returning * into saved_ingredient;

  return saved_ingredient;
end;
$$;

-- Keep purchase validation, audit, and expense behavior, using the selected
-- catalog identity for both the purchase line and catalog usage-date upsert.
do $migration$
declare
  definition text := pg_get_functiondef('public.save_bazaar_purchase(jsonb)'::regprocedure);
  old_expression text := 'public.normalize_bazaar_product_key(product_name_value)';
  new_expression text := 'coalesce(nullif(btrim(item_value ->> ''product_key''), ''''), public.normalize_bazaar_product_key(product_name_value))';
begin
  if position(new_expression in definition) = 0 then
    if position(old_expression in definition) = 0 then
      raise exception 'Unexpected save_bazaar_purchase definition';
    end if;
    execute replace(definition, old_expression, new_expression);
  end if;
end;
$migration$;

commit;
