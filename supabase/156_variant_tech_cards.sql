-- One protected recipe per menu-item variant. Existing product-level cards use
-- the empty variant key and remain backward compatible.

begin;

alter table public.menu_item_tech_cards
  add column if not exists variant_option_id text not null default '';
alter table public.menu_item_tech_card_ingredients
  add column if not exists variant_option_id text not null default '';
alter table public.menu_item_tech_card_components
  add column if not exists variant_option_id text not null default '';

alter table public.menu_item_tech_card_ingredients
  drop constraint if exists menu_item_tech_card_ingredients_menu_item_id_fkey;
alter table public.menu_item_tech_card_components
  drop constraint if exists menu_item_tech_card_components_menu_item_id_fkey;
alter table public.menu_item_tech_cards drop constraint if exists menu_item_tech_cards_pkey;
alter table public.menu_item_tech_cards
  add constraint menu_item_tech_cards_pkey primary key (menu_item_id, variant_option_id);
alter table public.menu_item_tech_card_ingredients
  add constraint menu_item_tech_card_ingredients_card_fkey
  foreign key (menu_item_id, variant_option_id)
  references public.menu_item_tech_cards(menu_item_id, variant_option_id) on delete cascade;
alter table public.menu_item_tech_card_components
  add constraint menu_item_tech_card_components_card_fkey
  foreign key (menu_item_id, variant_option_id)
  references public.menu_item_tech_cards(menu_item_id, variant_option_id) on delete cascade;

alter table public.menu_item_tech_card_components
  drop constraint if exists menu_item_tech_card_components_variant_unique;
alter table public.menu_item_tech_card_components
  add constraint menu_item_tech_card_components_variant_unique
  unique (menu_item_id, variant_option_id, component_menu_item_id, selected_options);

create index if not exists idx_tech_card_ingredients_card_order
  on public.menu_item_tech_card_ingredients(menu_item_id, variant_option_id, sort_order, id);
create index if not exists idx_tech_card_components_card_order
  on public.menu_item_tech_card_components(menu_item_id, variant_option_id, sort_order, id);

create or replace function public.calculate_menu_item_variant_tech_card_real_cost(
  target_menu_item_id text,
  target_variant_option_id text
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_portion_count numeric;
  ingredient_batch_cost numeric := 0;
  component_cost_per_portion numeric := 0;
  missing_component_costs integer := 0;
begin
  select card.portion_count into target_portion_count
  from public.menu_item_tech_cards card
  where card.menu_item_id = target_menu_item_id
    and card.variant_option_id = coalesce(target_variant_option_id, '');
  if target_portion_count is null then return null; end if;

  select coalesce(sum(ingredient.quantity * ingredient.unit_price_uzs), 0)
  into ingredient_batch_cost
  from public.menu_item_tech_card_ingredients ingredient
  where ingredient.menu_item_id = target_menu_item_id
    and ingredient.variant_option_id = coalesce(target_variant_option_id, '');

  select
    coalesce(sum(component.quantity * coalesce(
      (
        select (item_cost.variant_costs ->> selected.value)::numeric
        from jsonb_each_text(component.selected_options) selected
        where item_cost.variant_costs ? selected.value
          and (item_cost.variant_costs ->> selected.value) ~ '^[0-9]+$'
        order by selected.key limit 1
      ),
      item_cost.cost_price::numeric
    )), 0),
    count(*) filter (where item_cost.menu_item_id is null)
  into component_cost_per_portion, missing_component_costs
  from public.menu_item_tech_card_components component
  left join public.menu_item_costs item_cost
    on item_cost.menu_item_id = component.component_menu_item_id
  where component.menu_item_id = target_menu_item_id
    and component.variant_option_id = coalesce(target_variant_option_id, '');

  if missing_component_costs > 0 then return null; end if;
  return greatest(0, round((ingredient_batch_cost / target_portion_count) + component_cost_per_portion))::bigint;
end;
$$;

revoke all on function public.calculate_menu_item_variant_tech_card_real_cost(text, text)
  from public, anon, authenticated;

create or replace function public.calculate_menu_item_tech_card_real_cost(target_menu_item_id text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select public.calculate_menu_item_variant_tech_card_real_cost(target_menu_item_id, '');
$$;

create or replace function public.enforce_menu_item_cost_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare calculated_cost bigint;
begin
  if exists (
    select 1 from public.menu_item_tech_cards card
    where card.menu_item_id = new.menu_item_id and card.variant_option_id = ''
  ) then
    calculated_cost := public.calculate_menu_item_variant_tech_card_real_cost(new.menu_item_id, '');
    if calculated_cost is null then raise exception 'Every included menu item must have a real cost'; end if;
    new.cost_price := calculated_cost::integer;
    new.cost_source := 'tech_card';
  else
    new.cost_source := 'manual';
  end if;
  return new;
end;
$$;

create or replace function public.sync_menu_item_tech_card_real_costs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_count integer := 0;
  pass integer;
begin
  update public.menu_item_costs item_cost
  set cost_source = 'manual', updated_at = now()
  where item_cost.cost_source = 'tech_card'
    and not exists (
      select 1 from public.menu_item_tech_cards card
      where card.menu_item_id = item_cost.menu_item_id and card.variant_option_id = ''
    );

  select count(*) into card_count from public.menu_item_tech_cards;
  for pass in 0..card_count loop
    insert into public.menu_item_costs (menu_item_id, cost_price, variant_costs, cost_source, updated_at)
    select
      item.id,
      coalesce(base.cost_price, existing.cost_price, 0)::integer,
      coalesce(existing.variant_costs, '{}'::jsonb) || coalesce(variants.costs, '{}'::jsonb),
      case when base.cost_price is not null then 'tech_card' else coalesce(existing.cost_source, 'manual') end,
      now()
    from public.menu_items item
    left join public.menu_item_costs existing on existing.menu_item_id = item.id
    left join lateral (
      select public.calculate_menu_item_variant_tech_card_real_cost(item.id, '') as cost_price
      where exists (
        select 1 from public.menu_item_tech_cards card
        where card.menu_item_id = item.id and card.variant_option_id = ''
      )
    ) base on true
    left join lateral (
      select jsonb_object_agg(card.variant_option_id, calculated.cost_price) as costs
      from public.menu_item_tech_cards card
      cross join lateral (
        select public.calculate_menu_item_variant_tech_card_real_cost(card.menu_item_id, card.variant_option_id) as cost_price
      ) calculated
      where card.menu_item_id = item.id and card.variant_option_id <> ''
        and calculated.cost_price is not null
    ) variants on true
    where base.cost_price is not null or variants.costs is not null
    on conflict (menu_item_id) do update set
      cost_price = excluded.cost_price,
      variant_costs = excluded.variant_costs,
      cost_source = excluded.cost_source,
      updated_at = excluded.updated_at;
  end loop;

  if exists (
    select 1 from public.menu_item_tech_cards card
    where public.calculate_menu_item_variant_tech_card_real_cost(card.menu_item_id, card.variant_option_id) is null
  ) then
    raise exception 'Every included menu item must have a real cost';
  end if;
end;
$$;

create or replace function public.save_menu_item_tech_card(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_menu_item_id text := nullif(btrim(payload ->> 'menu_item_id'), '');
  target_variant_option_id text := coalesce(nullif(btrim(payload ->> 'variant_option_id'), ''), '');
  target_portion_count numeric;
  target_batch_output_quantity numeric;
  target_batch_output_unit text := coalesce(nullif(btrim(payload ->> 'batch_output_unit'), ''), 'kg');
  ingredient jsonb; ingredient_index integer := 0;
  component jsonb; component_index integer := 0;
  ingredients jsonb := coalesce(payload -> 'ingredients', '[]'::jsonb);
  components jsonb := coalesce(payload -> 'components', '[]'::jsonb);
begin
  if public.current_staff_can_access('tech_cards') is not true
    or public.current_staff_can_write('menu') is not true then
    raise exception 'Manage Menu and Tech Cards access are required to save tech cards' using errcode = '42501';
  end if;
  if target_menu_item_id is null or not exists (
    select 1 from public.menu_items item where item.id = target_menu_item_id and item.deleted_at is null
  ) then raise exception 'Active menu item not found'; end if;
  if target_variant_option_id <> '' and not exists (
    select 1 from public.menu_items item
    cross join lateral jsonb_array_elements(coalesce(item.option_groups, '[]'::jsonb)) option_group
    cross join lateral jsonb_array_elements(coalesce(option_group -> 'options', '[]'::jsonb)) option_value
    where item.id = target_menu_item_id and option_value ->> 'id' = target_variant_option_id
  ) then raise exception 'Menu item variant not found'; end if;

  target_portion_count := nullif(payload ->> 'portion_count', '')::numeric;
  target_batch_output_quantity := nullif(payload ->> 'batch_output_quantity', '')::numeric;
  if target_portion_count is null or target_portion_count <= 0 then raise exception 'Portion count must be greater than zero'; end if;
  if target_batch_output_quantity is not null and target_batch_output_quantity <= 0 then raise exception 'Batch output must be greater than zero'; end if;
  if target_batch_output_unit not in ('g', 'kg', 'ml', 'l', 'piece') then raise exception 'Invalid batch output unit'; end if;
  if jsonb_typeof(ingredients) <> 'array' or jsonb_typeof(components) <> 'array' then raise exception 'Ingredients and included menu items must be arrays'; end if;
  if jsonb_array_length(ingredients) = 0 and jsonb_array_length(components) = 0 then raise exception 'At least one ingredient or included menu item is required'; end if;
  if nullif(btrim(coalesce(payload ->> 'preparation_steps', '')), '') is null then raise exception 'Preparation method is required'; end if;

  insert into public.menu_item_tech_cards (
    menu_item_id, variant_option_id, portion_count, batch_output_quantity, batch_output_unit,
    preparation_steps, notes, updated_by, updated_at
  ) values (
    target_menu_item_id, target_variant_option_id, target_portion_count, target_batch_output_quantity,
    target_batch_output_unit, btrim(payload ->> 'preparation_steps'), btrim(coalesce(payload ->> 'notes', '')), auth.uid(), now()
  ) on conflict (menu_item_id, variant_option_id) do update set
    portion_count = excluded.portion_count, batch_output_quantity = excluded.batch_output_quantity,
    batch_output_unit = excluded.batch_output_unit, preparation_steps = excluded.preparation_steps,
    notes = excluded.notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  delete from public.menu_item_tech_card_ingredients
  where menu_item_id = target_menu_item_id and variant_option_id = target_variant_option_id;
  delete from public.menu_item_tech_card_components
  where menu_item_id = target_menu_item_id and variant_option_id = target_variant_option_id;

  for ingredient in select value from jsonb_array_elements(ingredients) loop
    ingredient_index := ingredient_index + 1;
    if nullif(btrim(ingredient ->> 'name'), '') is null then raise exception 'Ingredient % needs a name', ingredient_index; end if;
    if nullif(ingredient ->> 'quantity', '')::numeric <= 0 then raise exception 'Ingredient % quantity must be greater than zero', ingredient_index; end if;
    if ingredient ->> 'unit' not in ('g', 'kg', 'ml', 'l', 'piece') then raise exception 'Ingredient % has an invalid unit', ingredient_index; end if;
    if nullif(ingredient ->> 'unit_price_uzs', '')::bigint < 0 then raise exception 'Ingredient % price cannot be negative', ingredient_index; end if;
    insert into public.menu_item_tech_card_ingredients (
      menu_item_id, variant_option_id, name, quantity, unit, unit_price_uzs, sort_order, updated_at
    ) values (
      target_menu_item_id, target_variant_option_id, btrim(ingredient ->> 'name'),
      (ingredient ->> 'quantity')::numeric, ingredient ->> 'unit',
      (ingredient ->> 'unit_price_uzs')::bigint, ingredient_index, now()
    );
  end loop;

  for component in select value from jsonb_array_elements(components) loop
    component_index := component_index + 1;
    if nullif(btrim(component ->> 'component_menu_item_id'), '') is null then raise exception 'Included menu item % must be selected', component_index; end if;
    if component ->> 'component_menu_item_id' = target_menu_item_id then raise exception 'A menu item cannot include itself'; end if;
    if jsonb_typeof(coalesce(component -> 'selected_options', '{}'::jsonb)) <> 'object' then raise exception 'Included menu item % variants must be an object', component_index; end if;
    if nullif(component ->> 'quantity', '')::numeric <= 0 then raise exception 'Included menu item % quantity must be greater than zero', component_index; end if;
    if not exists (select 1 from public.menu_items item where item.id = component ->> 'component_menu_item_id' and item.deleted_at is null) then raise exception 'Included menu item % is not active', component_index; end if;
    if exists (
      select 1 from jsonb_each_text(coalesce(component -> 'selected_options', '{}'::jsonb)) selected
      where not exists (
        select 1 from public.menu_items item
        cross join lateral jsonb_array_elements(coalesce(item.option_groups, '[]'::jsonb)) option_group
        cross join lateral jsonb_array_elements(coalesce(option_group -> 'options', '[]'::jsonb)) option_value
        where item.id = component ->> 'component_menu_item_id'
          and option_group ->> 'id' = selected.key and option_value ->> 'id' = selected.value
      )
    ) then raise exception 'Included menu item % has an invalid variant', component_index; end if;
    insert into public.menu_item_tech_card_components (
      menu_item_id, variant_option_id, component_menu_item_id, selected_options, quantity, sort_order, updated_at
    ) values (
      target_menu_item_id, target_variant_option_id, component ->> 'component_menu_item_id',
      coalesce(component -> 'selected_options', '{}'::jsonb), (component ->> 'quantity')::numeric,
      component_index, now()
    );
  end loop;
end;
$$;

revoke all on function public.save_menu_item_tech_card(jsonb) from public, anon;
grant execute on function public.save_menu_item_tech_card(jsonb) to authenticated;

create or replace function public.snapshot_order_item_tech_card_components()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare target_variant_option_id text := '';
begin
  if tg_op = 'UPDATE' and new.menu_item_id is not distinct from old.menu_item_id then
    if new.tech_card_component_snapshot is distinct from old.tech_card_component_snapshot then raise exception 'Order item tech-card component snapshots are immutable'; end if;
    return new;
  end if;
  select card.variant_option_id into target_variant_option_id
  from public.menu_item_tech_cards card
  where card.menu_item_id = new.menu_item_id
    and (card.variant_option_id = '' or card.variant_option_id in (select value from jsonb_each_text(coalesce(new.selected_options, '{}'::jsonb))))
  order by (card.variant_option_id <> '') desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'menu_item_id', component.component_menu_item_id, 'selected_options', component.selected_options,
    'quantity', component.quantity, 'name_uz', included.name_uz, 'name_ru', included.name_ru,
    'name_en', included.name_en, 'sale_unit', coalesce(included.sale_unit, 'piece')
  ) order by component.sort_order, component.id), '[]'::jsonb)
  into new.tech_card_component_snapshot
  from public.menu_item_tech_card_components component
  join public.menu_items included on included.id = component.component_menu_item_id
  where component.menu_item_id = new.menu_item_id and component.variant_option_id = coalesce(target_variant_option_id, '');
  return new;
end;
$$;

drop trigger if exists order_items_snapshot_tech_card_components on public.order_items;
create trigger order_items_snapshot_tech_card_components
before insert or update of menu_item_id, selected_options, tech_card_component_snapshot
on public.order_items
for each row execute function public.snapshot_order_item_tech_card_components();

select public.sync_menu_item_tech_card_real_costs();

commit;

notify pgrst, 'reload schema';
