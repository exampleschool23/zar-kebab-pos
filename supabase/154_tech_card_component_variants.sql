-- Let a structured Tech Card component target one configured product variant.
-- The protected variant cost drives the current recipe calculation in the app,
-- while order-item snapshots keep the exact selection used for stock deduction.

begin;

alter table public.menu_item_tech_card_components
  add column if not exists selected_options jsonb not null default '{}'::jsonb;

alter table public.menu_item_tech_card_components
  drop constraint if exists menu_item_tech_card_components_selected_options_object;
alter table public.menu_item_tech_card_components
  add constraint menu_item_tech_card_components_selected_options_object
  check (jsonb_typeof(selected_options) = 'object');

alter table public.menu_item_tech_card_components
  drop constraint if exists menu_item_tech_card_components_unique;
alter table public.menu_item_tech_card_components
  drop constraint if exists menu_item_tech_card_components_variant_unique;
alter table public.menu_item_tech_card_components
  add constraint menu_item_tech_card_components_variant_unique
  unique (menu_item_id, component_menu_item_id, selected_options);

create or replace function public.snapshot_order_item_tech_card_components()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.menu_item_id is not distinct from old.menu_item_id
  then
    if new.tech_card_component_snapshot is distinct from old.tech_card_component_snapshot then
      raise exception 'Order item tech-card component snapshots are immutable';
    end if;
    return new;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'menu_item_id', component.component_menu_item_id,
        'selected_options', component.selected_options,
        'quantity', component.quantity,
        'name_uz', included.name_uz,
        'name_ru', included.name_ru,
        'name_en', included.name_en,
        'sale_unit', coalesce(included.sale_unit, 'piece')
      )
      order by component.sort_order, component.id
    ),
    '[]'::jsonb
  ) into new.tech_card_component_snapshot
  from public.menu_item_tech_card_components component
  join public.menu_items included on included.id = component.component_menu_item_id
  where component.menu_item_id = new.menu_item_id;

  return new;
end;
$$;

revoke all on function public.snapshot_order_item_tech_card_components()
  from public, anon, authenticated;

create or replace function public.save_menu_item_tech_card(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_menu_item_id text := nullif(btrim(payload ->> 'menu_item_id'), '');
  target_portion_count numeric;
  target_batch_output_quantity numeric;
  target_batch_output_unit text := coalesce(nullif(btrim(payload ->> 'batch_output_unit'), ''), 'kg');
  ingredient jsonb;
  ingredient_index integer := 0;
  ingredient_name text;
  ingredient_quantity numeric;
  ingredient_unit text;
  ingredient_unit_price bigint;
  component jsonb;
  component_index integer := 0;
  component_menu_item_id text;
  component_selected_options jsonb;
  component_quantity numeric;
  ingredients jsonb := coalesce(payload -> 'ingredients', '[]'::jsonb);
  components jsonb := coalesce(payload -> 'components', '[]'::jsonb);
begin
  if public.current_staff_can_access('tech_cards') is not true
    or public.current_staff_can_write('menu') is not true then
    raise exception 'Manage Menu and Tech Cards access are required to save tech cards' using errcode = '42501';
  end if;

  if target_menu_item_id is null then raise exception 'Menu item id is required'; end if;
  if not exists (
    select 1 from public.menu_items item
    where item.id = target_menu_item_id and item.deleted_at is null
  ) then
    raise exception 'Active menu item not found';
  end if;

  target_portion_count := nullif(payload ->> 'portion_count', '')::numeric;
  if target_portion_count is null or target_portion_count <= 0 then
    raise exception 'Portion count must be greater than zero';
  end if;
  target_batch_output_quantity := nullif(payload ->> 'batch_output_quantity', '')::numeric;
  if target_batch_output_quantity is not null and target_batch_output_quantity <= 0 then
    raise exception 'Batch output must be greater than zero';
  end if;
  if target_batch_output_unit not in ('g', 'kg', 'ml', 'l', 'piece') then
    raise exception 'Invalid batch output unit';
  end if;
  if jsonb_typeof(ingredients) <> 'array' or jsonb_typeof(components) <> 'array' then
    raise exception 'Ingredients and included menu items must be arrays';
  end if;
  if jsonb_array_length(ingredients) = 0 and jsonb_array_length(components) = 0 then
    raise exception 'At least one ingredient or included menu item is required';
  end if;
  if nullif(btrim(coalesce(payload ->> 'preparation_steps', '')), '') is null then
    raise exception 'Preparation method is required';
  end if;

  insert into public.menu_item_tech_cards (
    menu_item_id, portion_count, batch_output_quantity, batch_output_unit,
    preparation_steps, notes, updated_by, updated_at
  ) values (
    target_menu_item_id, target_portion_count, target_batch_output_quantity,
    target_batch_output_unit, btrim(coalesce(payload ->> 'preparation_steps', '')),
    btrim(coalesce(payload ->> 'notes', '')), auth.uid(), now()
  )
  on conflict (menu_item_id) do update set
    portion_count = excluded.portion_count,
    batch_output_quantity = excluded.batch_output_quantity,
    batch_output_unit = excluded.batch_output_unit,
    preparation_steps = excluded.preparation_steps,
    notes = excluded.notes,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  delete from public.menu_item_tech_card_ingredients where menu_item_id = target_menu_item_id;
  delete from public.menu_item_tech_card_components where menu_item_id = target_menu_item_id;

  for ingredient in select value from jsonb_array_elements(ingredients)
  loop
    ingredient_index := ingredient_index + 1;
    ingredient_name := nullif(btrim(ingredient ->> 'name'), '');
    ingredient_quantity := nullif(ingredient ->> 'quantity', '')::numeric;
    ingredient_unit := nullif(btrim(ingredient ->> 'unit'), '');
    ingredient_unit_price := nullif(ingredient ->> 'unit_price_uzs', '')::bigint;

    if ingredient_name is null then raise exception 'Ingredient % needs a name', ingredient_index; end if;
    if ingredient_quantity is null or ingredient_quantity <= 0 then
      raise exception 'Ingredient % quantity must be greater than zero', ingredient_index;
    end if;
    if ingredient_unit not in ('g', 'kg', 'ml', 'l', 'piece') then
      raise exception 'Ingredient % has an invalid unit', ingredient_index;
    end if;
    if ingredient_unit_price is null or ingredient_unit_price < 0 then
      raise exception 'Ingredient % price cannot be negative', ingredient_index;
    end if;

    insert into public.menu_item_tech_card_ingredients (
      menu_item_id, name, quantity, unit, unit_price_uzs, sort_order, updated_at
    ) values (
      target_menu_item_id, ingredient_name, ingredient_quantity, ingredient_unit,
      ingredient_unit_price, ingredient_index, now()
    );
  end loop;

  for component in select value from jsonb_array_elements(components)
  loop
    component_index := component_index + 1;
    component_menu_item_id := nullif(btrim(component ->> 'component_menu_item_id'), '');
    component_selected_options := coalesce(component -> 'selected_options', '{}'::jsonb);
    component_quantity := nullif(component ->> 'quantity', '')::numeric;

    if component_menu_item_id is null then
      raise exception 'Included menu item % must be selected', component_index;
    end if;
    if component_menu_item_id = target_menu_item_id then
      raise exception 'A menu item cannot include itself';
    end if;
    if jsonb_typeof(component_selected_options) <> 'object' then
      raise exception 'Included menu item % variants must be an object', component_index;
    end if;
    if component_quantity is null or component_quantity <= 0 then
      raise exception 'Included menu item % quantity must be greater than zero', component_index;
    end if;
    if not exists (
      select 1 from public.menu_items item
      where item.id = component_menu_item_id and item.deleted_at is null
    ) then
      raise exception 'Included menu item % is not active', component_index;
    end if;
    if exists (
      select 1
      from jsonb_each_text(component_selected_options) selected
      where not exists (
        select 1
        from public.menu_items item
        cross join lateral jsonb_array_elements(coalesce(item.option_groups, '[]'::jsonb)) option_group
        cross join lateral jsonb_array_elements(coalesce(option_group -> 'options', '[]'::jsonb)) option_value
        where item.id = component_menu_item_id
          and option_group ->> 'id' = selected.key
          and option_value ->> 'id' = selected.value
      )
    ) then
      raise exception 'Included menu item % has an invalid variant', component_index;
    end if;

    insert into public.menu_item_tech_card_components (
      menu_item_id, component_menu_item_id, selected_options, quantity, sort_order, updated_at
    ) values (
      target_menu_item_id, component_menu_item_id, component_selected_options,
      component_quantity, component_index, now()
    );
  end loop;
end;
$$;

revoke all on function public.save_menu_item_tech_card(jsonb) from public, anon;
grant execute on function public.save_menu_item_tech_card(jsonb) to authenticated;

commit;

-- Keep the existing exactly-once payment boundary, now including the selected
-- variant stock for structured Tech Card contents.
begin;

create or replace function public.apply_paid_order_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_paid boolean;
  new_paid boolean;
  sold_item record;
  sold_quantity integer;
  component jsonb;
  component_quantity numeric;
  component_stock_quantity integer;
begin
  old_paid := old.payment_status = 'paid'
    or old.status in ('paid', 'completed')
    or old.paid_at is not null;
  new_paid := new.payment_status = 'paid'
    or new.status in ('paid', 'completed')
    or new.paid_at is not null;

  if old.stock_deducted_at is not null then
    new.stock_deducted_at := old.stock_deducted_at;
    return new;
  end if;
  if old_paid or not new_paid then
    new.stock_deducted_at := null;
    return new;
  end if;

  for sold_item in
    select oi.menu_item_id, oi.quantity, oi.selected_options, oi.tech_card_component_snapshot
    from public.order_items oi
    where oi.order_id = new.id
      and coalesce(oi.status, '') <> 'cancelled'
      and coalesce(oi.sale_unit, 'piece') = 'piece'
      and oi.quantity > 0
    order by oi.id
  loop
    sold_quantity := trunc(sold_item.quantity)::integer;

    update public.menu_items
    set
      stock_count = case when stock_count > 0 then greatest(stock_count - sold_quantity, 0) else stock_count end,
      option_groups = public.decrement_selected_variant_stock(option_groups, sold_item.selected_options, sold_quantity)
    where id = sold_item.menu_item_id;

    for component in
      select value
      from jsonb_array_elements(
        case when jsonb_typeof(sold_item.tech_card_component_snapshot) = 'array'
          then sold_item.tech_card_component_snapshot else '[]'::jsonb end
      )
    loop
      if coalesce(component ->> 'sale_unit', 'piece') <> 'piece' then continue; end if;
      component_quantity := case
        when coalesce(component ->> 'quantity', '') ~ '^\d+(\.\d+)?$'
          then (component ->> 'quantity')::numeric
        else 0
      end;
      if component_quantity <= 0 or component_quantity <> trunc(component_quantity) then continue; end if;

      component_stock_quantity := sold_quantity * component_quantity::integer;
      update public.menu_items
      set
        stock_count = case
          when stock_count > 0 then greatest(stock_count - component_stock_quantity, 0)
          else stock_count
        end,
        option_groups = public.decrement_selected_variant_stock(
          option_groups,
          coalesce(component -> 'selected_options', '{}'::jsonb),
          component_stock_quantity
        )
      where id = nullif(component ->> 'menu_item_id', '');
    end loop;
  end loop;

  new.stock_deducted_at := now();
  return new;
end;
$$;

revoke all on function public.apply_paid_order_stock() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
