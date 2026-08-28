-- Structured menu-item contents for combo/set tech cards. Raw ingredients stay
-- separate. New order items snapshot the configured contents so later recipe
-- edits never rewrite historical set-audit quantities.

begin;

create table if not exists public.menu_item_tech_card_components (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null references public.menu_item_tech_cards(menu_item_id) on delete cascade,
  component_menu_item_id text not null references public.menu_items(id) on delete restrict,
  quantity numeric(12,3) not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_tech_card_components_quantity_positive check (quantity > 0),
  constraint menu_item_tech_card_components_sort_order_positive check (sort_order > 0),
  constraint menu_item_tech_card_components_not_self check (menu_item_id <> component_menu_item_id),
  constraint menu_item_tech_card_components_unique unique (menu_item_id, component_menu_item_id)
);

create index if not exists idx_menu_item_tech_card_components_item_order
  on public.menu_item_tech_card_components(menu_item_id, sort_order, id);

comment on table public.menu_item_tech_card_components is
  'Current structured menu-item contents of a set/combo; separate from raw recipe ingredients.';

alter table public.menu_item_tech_card_components enable row level security;
revoke all on table public.menu_item_tech_card_components from public, anon, authenticated;
grant select, insert, update, delete on table public.menu_item_tech_card_components to authenticated;

create policy "Staff can read tech card components"
  on public.menu_item_tech_card_components for select
  to authenticated
  using (public.current_staff_can_access('tech_cards'));

create policy "Menu writers can create tech card components"
  on public.menu_item_tech_card_components for insert
  to authenticated
  with check (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

create policy "Menu writers can update tech card components"
  on public.menu_item_tech_card_components for update
  to authenticated
  using (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  )
  with check (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

create policy "Menu writers can delete tech card components"
  on public.menu_item_tech_card_components for delete
  to authenticated
  using (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

create or replace function public.reject_recursive_tech_card_component()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  creates_cycle boolean := false;
begin
  if new.menu_item_id = new.component_menu_item_id then
    raise exception 'A menu item cannot include itself';
  end if;

  with recursive descendants(menu_item_id) as (
    select new.component_menu_item_id
    union
    select component.component_menu_item_id
    from public.menu_item_tech_card_components component
    join descendants current_item
      on component.menu_item_id = current_item.menu_item_id
    where component.id is distinct from new.id
  )
  select exists (
    select 1 from descendants where menu_item_id = new.menu_item_id
  ) into creates_cycle;

  if creates_cycle then
    raise exception 'Included menu items cannot form a recursive set';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_recursive_tech_card_component()
  from public, anon, authenticated;

drop trigger if exists tech_card_components_reject_cycles
  on public.menu_item_tech_card_components;
create trigger tech_card_components_reject_cycles
before insert or update of menu_item_id, component_menu_item_id
on public.menu_item_tech_card_components
for each row execute function public.reject_recursive_tech_card_component();

alter table public.order_items
  add column if not exists tech_card_component_snapshot jsonb not null default '[]'::jsonb;

alter table public.order_items
  drop constraint if exists order_items_tech_card_component_snapshot_array;
alter table public.order_items
  add constraint order_items_tech_card_component_snapshot_array
  check (jsonb_typeof(tech_card_component_snapshot) = 'array');

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

drop trigger if exists order_items_snapshot_tech_card_components
  on public.order_items;
create trigger order_items_snapshot_tech_card_components
before insert or update of menu_item_id, tech_card_component_snapshot
on public.order_items
for each row execute function public.snapshot_order_item_tech_card_components();

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
  component_quantity numeric;
  ingredients jsonb := coalesce(payload -> 'ingredients', '[]'::jsonb);
  components jsonb := coalesce(payload -> 'components', '[]'::jsonb);
begin
  if public.current_staff_can_access('tech_cards') is not true
    or public.current_staff_can_write('menu') is not true then
    raise exception 'Manage Menu and Tech Cards access are required to save tech cards' using errcode = '42501';
  end if;

  if target_menu_item_id is null then
    raise exception 'Menu item id is required';
  end if;
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

  delete from public.menu_item_tech_card_ingredients
  where menu_item_id = target_menu_item_id;
  delete from public.menu_item_tech_card_components
  where menu_item_id = target_menu_item_id;

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
    component_quantity := nullif(component ->> 'quantity', '')::numeric;

    if component_menu_item_id is null then
      raise exception 'Included menu item % must be selected', component_index;
    end if;
    if component_menu_item_id = target_menu_item_id then
      raise exception 'A menu item cannot include itself';
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

    insert into public.menu_item_tech_card_components (
      menu_item_id, component_menu_item_id, quantity, sort_order, updated_at
    ) values (
      target_menu_item_id, component_menu_item_id, component_quantity,
      component_index, now()
    );
  end loop;
end;
$$;

revoke all on function public.save_menu_item_tech_card(jsonb) from public, anon;
grant execute on function public.save_menu_item_tech_card(jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';
