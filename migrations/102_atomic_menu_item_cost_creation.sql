-- New menu products must have a positive protected real cost.
-- Create the public catalog row and private cost row in one transaction so a
-- failed cost write can never leave a costless product behind.

create or replace function public.create_menu_item_with_cost(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id text := nullif(btrim(payload ->> 'id'), '');
  real_cost_text text := btrim(coalesce(payload ->> 'cost_price', ''));
  real_cost integer;
  protected_variant_costs jsonb := coalesce(payload -> 'variant_costs', '{}'::jsonb);
  normalized_variant_costs jsonb := '{}'::jsonb;
  inserted_item public.menu_items%rowtype;
begin
  if not coalesce(public.current_staff_can_write('menu'), false) then
    raise exception 'Menu write access is required' using errcode = '42501';
  end if;

  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'A menu item payload is required' using errcode = '22023';
  end if;

  if target_id is null then
    raise exception 'Menu item id is required' using errcode = '22023';
  end if;

  if real_cost_text !~ '^[0-9]+([.][0-9]+)?$' then
    raise exception 'Real cost must be greater than zero' using errcode = '22023';
  end if;

  real_cost := round(real_cost_text::numeric)::integer;
  if real_cost <= 0 then
    raise exception 'Real cost must be greater than zero' using errcode = '22023';
  end if;

  if jsonb_typeof(protected_variant_costs) is distinct from 'object' then
    raise exception 'Variant costs must be an object' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(protected_variant_costs) as variant_cost
    where btrim(variant_cost.key) = ''
       or variant_cost.value !~ '^[0-9]+$'
  ) then
    raise exception 'Variant costs must contain non-negative whole numbers' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_object_agg(variant_cost.key, variant_cost.value::integer),
    '{}'::jsonb
  )
  into normalized_variant_costs
  from jsonb_each_text(protected_variant_costs) as variant_cost;

  insert into public.menu_items (
    id,
    external_id,
    category_id,
    name_uz,
    name_ru,
    name_en,
    description_uz,
    description_ru,
    description_en,
    price,
    old_price,
    grams,
    millilitres,
    kcal,
    stock_count,
    image_url,
    option_groups,
    available,
    show_in_cashier_quick_items,
    cashier_only,
    public_hidden,
    waiter_hidden,
    send_to_kitchen,
    visible_from_time,
    visible_until_time,
    sort_order,
    quick_item_sort_order
  ) values (
    target_id,
    coalesce(nullif(btrim(payload ->> 'external_id'), ''), public.generate_menu_item_external_id()),
    nullif(payload ->> 'category_id', ''),
    coalesce(payload ->> 'name_uz', ''),
    coalesce(payload ->> 'name_ru', ''),
    coalesce(payload ->> 'name_en', ''),
    coalesce(payload ->> 'description_uz', ''),
    coalesce(payload ->> 'description_ru', ''),
    coalesce(payload ->> 'description_en', ''),
    greatest(0, coalesce((payload ->> 'price')::integer, 0)),
    greatest(0, coalesce((payload ->> 'old_price')::integer, 0)),
    greatest(0, coalesce((payload ->> 'grams')::integer, 0)),
    greatest(0, coalesce((payload ->> 'millilitres')::integer, 0)),
    greatest(0, coalesce((payload ->> 'kcal')::integer, 0)),
    greatest(0, coalesce((payload ->> 'stock_count')::integer, 0)),
    coalesce(payload ->> 'image_url', ''),
    coalesce(payload -> 'option_groups', '[]'::jsonb),
    coalesce((payload ->> 'available')::boolean, true),
    coalesce((payload ->> 'show_in_cashier_quick_items')::boolean, false),
    coalesce((payload ->> 'cashier_only')::boolean, false),
    coalesce((payload ->> 'public_hidden')::boolean, false),
    coalesce((payload ->> 'waiter_hidden')::boolean, false),
    coalesce((payload ->> 'send_to_kitchen')::boolean, false),
    nullif(payload ->> 'visible_from_time', '')::time,
    nullif(payload ->> 'visible_until_time', '')::time,
    coalesce((payload ->> 'sort_order')::integer, 0),
    coalesce((payload ->> 'quick_item_sort_order')::integer, 0)
  )
  returning * into inserted_item;

  insert into public.menu_item_costs (
    menu_item_id,
    cost_price,
    variant_costs,
    updated_at
  ) values (
    target_id,
    real_cost,
    normalized_variant_costs,
    now()
  );

  return to_jsonb(inserted_item);
end;
$$;

revoke all on function public.create_menu_item_with_cost(jsonb) from public, anon, authenticated;
grant execute on function public.create_menu_item_with_cost(jsonb) to authenticated;

-- Product creation must go through the atomic function above. Existing catalog
-- rows remain directly editable/deletable by staff with Menu write access.
drop policy if exists "staff_all_menu_items" on public.menu_items;
drop policy if exists "owner_admin_write_menu_items" on public.menu_items;
drop policy if exists "feature_access_write_menu_items" on public.menu_items;
drop policy if exists "feature_access_update_menu_items" on public.menu_items;
drop policy if exists "feature_access_delete_menu_items" on public.menu_items;

create policy "feature_access_update_menu_items"
  on public.menu_items for update
  to authenticated
  using (public.current_staff_can_write('menu'))
  with check (public.current_staff_can_write('menu'));

create policy "feature_access_delete_menu_items"
  on public.menu_items for delete
  to authenticated
  using (public.current_staff_can_write('menu'));

notify pgrst, 'reload schema';
