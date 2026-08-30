-- Make the Daily Bazaar ingredient catalog authoritative for new purchases.
-- Historical purchase rows remain immutable snapshots of their original names,
-- categories, units, and paid totals.
begin;

alter table public.bazaar_product_catalog
  add column if not exists normal_unit_price integer not null default 0,
  add column if not exists is_active boolean not null default true;

alter table public.bazaar_product_catalog
  drop constraint if exists bazaar_product_catalog_normal_unit_price_nonnegative;

alter table public.bazaar_product_catalog
  add constraint bazaar_product_catalog_normal_unit_price_nonnegative
  check (normal_unit_price >= 0);

create or replace function public.guard_bazaar_product_catalog_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.daily_bazaar_catalog_rpc', true) = 'on' then
    return new;
  end if;

  -- Purchase saves may refresh usage dates, but only the catalog RPC may
  -- change the canonical ingredient definition or archive state.
  new.product_key := old.product_key;
  new.product_name := old.product_name;
  new.category := old.category;
  new.unit := old.unit;
  new.normal_unit_price := old.normal_unit_price;
  new.is_active := old.is_active;
  return new;
end;
$$;

create or replace function public.current_staff_can_manage_bazaar_ingredients()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select profile.status::text = 'active'
      and profile.role::text = 'owner'
      and public.current_staff_can_access('bazaar')
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false);
$$;

drop trigger if exists guard_bazaar_product_catalog_identity on public.bazaar_product_catalog;
create trigger guard_bazaar_product_catalog_identity
before update on public.bazaar_product_catalog
for each row execute function public.guard_bazaar_product_catalog_identity();

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
    and catalog.is_active;

  if not found then
    raise exception 'Choose an active ingredient from the Daily Bazaar catalog';
  end if;

  -- The purchase line is a historical snapshot of the canonical definition.
  new.product_name := ingredient.product_name;
  new.category := ingredient.category;
  new.unit := ingredient.unit;
  return new;
end;
$$;

drop trigger if exists require_bazaar_catalog_ingredient on public.bazaar_purchase_items;
create trigger require_bazaar_catalog_ingredient
before insert on public.bazaar_purchase_items
for each row execute function public.require_bazaar_catalog_ingredient();

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
    if ingredient_name <> existing_ingredient.product_name then
      raise exception 'Archive this ingredient and add a new one to change its name';
    end if;
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

create or replace function public.set_bazaar_ingredient_active(
  p_product_key text,
  p_is_active boolean
)
returns public.bazaar_product_catalog
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_ingredient public.bazaar_product_catalog%rowtype;
begin
  if not public.current_staff_can_manage_bazaar_ingredients() then
    raise exception 'Only an owner can manage Daily Bazaar ingredients';
  end if;
  if nullif(btrim(p_product_key), '') is null or p_is_active is null then
    raise exception 'Ingredient and active state are required';
  end if;

  perform set_config('app.daily_bazaar_catalog_rpc', 'on', true);
  update public.bazaar_product_catalog
  set is_active = p_is_active,
      updated_at = now()
  where product_key = p_product_key
  returning * into saved_ingredient;

  if not found then
    raise exception 'Daily Bazaar ingredient not found';
  end if;
  return saved_ingredient;
end;
$$;

revoke all on function public.guard_bazaar_product_catalog_identity() from public, anon, authenticated;
revoke all on function public.current_staff_can_manage_bazaar_ingredients() from public, anon;
grant execute on function public.current_staff_can_manage_bazaar_ingredients() to authenticated;
revoke all on function public.require_bazaar_catalog_ingredient() from public, anon, authenticated;
revoke all on function public.save_bazaar_ingredient(jsonb) from public, anon, authenticated;
revoke all on function public.set_bazaar_ingredient_active(text, boolean) from public, anon, authenticated;
grant execute on function public.save_bazaar_ingredient(jsonb) to authenticated;
grant execute on function public.set_bazaar_ingredient_active(text, boolean) to authenticated;

commit;
