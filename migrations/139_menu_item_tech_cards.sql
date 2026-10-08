-- Protected recipe/technology cards for menu items. Current recipe math is
-- operational data only; immutable order_items.cost_price snapshots remain the
-- source of truth for historical profit reporting.

begin;

create table if not exists public.menu_item_tech_cards (
  menu_item_id text primary key references public.menu_items(id) on delete cascade,
  portion_count numeric(12,3) not null default 1,
  batch_output_quantity numeric(12,3),
  batch_output_unit text not null default 'kg',
  preparation_steps text not null default '',
  notes text not null default '',
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_tech_cards_portion_count_positive check (portion_count > 0),
  constraint menu_item_tech_cards_batch_output_positive check (
    batch_output_quantity is null or batch_output_quantity > 0
  ),
  constraint menu_item_tech_cards_batch_output_unit_valid check (
    batch_output_unit in ('g', 'kg', 'ml', 'l', 'piece')
  ),
  constraint menu_item_tech_cards_preparation_present check (btrim(preparation_steps) <> '')
);

create table if not exists public.menu_item_tech_card_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id text not null references public.menu_item_tech_cards(menu_item_id) on delete cascade,
  name text not null,
  quantity numeric(12,3) not null,
  unit text not null,
  unit_price_uzs bigint not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_item_tech_card_ingredients_name_present check (btrim(name) <> ''),
  constraint menu_item_tech_card_ingredients_quantity_positive check (quantity > 0),
  constraint menu_item_tech_card_ingredients_unit_valid check (unit in ('g', 'kg', 'ml', 'l', 'piece')),
  constraint menu_item_tech_card_ingredients_price_nonnegative check (unit_price_uzs >= 0),
  constraint menu_item_tech_card_ingredients_sort_order_positive check (sort_order > 0)
);

create index if not exists idx_menu_item_tech_card_ingredients_item_order
  on public.menu_item_tech_card_ingredients(menu_item_id, sort_order, id);

comment on table public.menu_item_tech_cards is
  'Protected current recipe instructions, batch output, and portion yield for menu items.';
comment on table public.menu_item_tech_card_ingredients is
  'Protected current recipe ingredients with quantities and current per-unit prices.';

alter table public.menu_item_tech_cards enable row level security;
alter table public.menu_item_tech_card_ingredients enable row level security;

revoke all on table public.menu_item_tech_cards from public, anon, authenticated;
revoke all on table public.menu_item_tech_card_ingredients from public, anon, authenticated;
grant select, insert, update, delete on table public.menu_item_tech_cards to authenticated;
grant select, insert, update, delete on table public.menu_item_tech_card_ingredients to authenticated;

drop policy if exists "Staff can read menu tech cards" on public.menu_item_tech_cards;
create policy "Staff can read menu tech cards"
  on public.menu_item_tech_cards for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard', 'menu']));

drop policy if exists "Menu writers can create tech cards" on public.menu_item_tech_cards;
create policy "Menu writers can create tech cards"
  on public.menu_item_tech_cards for insert
  to authenticated
  with check (public.current_staff_can_write('menu'));

drop policy if exists "Menu writers can update tech cards" on public.menu_item_tech_cards;
create policy "Menu writers can update tech cards"
  on public.menu_item_tech_cards for update
  to authenticated
  using (public.current_staff_can_write('menu'))
  with check (public.current_staff_can_write('menu'));

drop policy if exists "Menu writers can delete tech cards" on public.menu_item_tech_cards;
create policy "Menu writers can delete tech cards"
  on public.menu_item_tech_cards for delete
  to authenticated
  using (public.current_staff_can_write('menu'));

drop policy if exists "Staff can read tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Staff can read tech card ingredients"
  on public.menu_item_tech_card_ingredients for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard', 'menu']));

drop policy if exists "Menu writers can create tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Menu writers can create tech card ingredients"
  on public.menu_item_tech_card_ingredients for insert
  to authenticated
  with check (public.current_staff_can_write('menu'));

drop policy if exists "Menu writers can update tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Menu writers can update tech card ingredients"
  on public.menu_item_tech_card_ingredients for update
  to authenticated
  using (public.current_staff_can_write('menu'))
  with check (public.current_staff_can_write('menu'));

drop policy if exists "Menu writers can delete tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Menu writers can delete tech card ingredients"
  on public.menu_item_tech_card_ingredients for delete
  to authenticated
  using (public.current_staff_can_write('menu'));

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
begin
  if public.current_staff_can_write('menu') is not true then
    raise exception 'Manage Menu access is required to save tech cards' using errcode = '42501';
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

  if jsonb_typeof(coalesce(payload -> 'ingredients', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(payload -> 'ingredients', '[]'::jsonb)) = 0 then
    raise exception 'At least one ingredient is required';
  end if;

  if nullif(btrim(coalesce(payload ->> 'preparation_steps', '')), '') is null then
    raise exception 'Preparation method is required';
  end if;

  insert into public.menu_item_tech_cards (
    menu_item_id,
    portion_count,
    batch_output_quantity,
    batch_output_unit,
    preparation_steps,
    notes,
    updated_by,
    updated_at
  ) values (
    target_menu_item_id,
    target_portion_count,
    target_batch_output_quantity,
    target_batch_output_unit,
    btrim(coalesce(payload ->> 'preparation_steps', '')),
    btrim(coalesce(payload ->> 'notes', '')),
    auth.uid(),
    now()
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

  for ingredient in
    select value from jsonb_array_elements(payload -> 'ingredients')
  loop
    ingredient_index := ingredient_index + 1;
    ingredient_name := nullif(btrim(ingredient ->> 'name'), '');
    ingredient_quantity := nullif(ingredient ->> 'quantity', '')::numeric;
    ingredient_unit := nullif(btrim(ingredient ->> 'unit'), '');
    ingredient_unit_price := nullif(ingredient ->> 'unit_price_uzs', '')::bigint;

    if ingredient_name is null then
      raise exception 'Ingredient % needs a name', ingredient_index;
    end if;
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
      menu_item_id,
      name,
      quantity,
      unit,
      unit_price_uzs,
      sort_order,
      updated_at
    ) values (
      target_menu_item_id,
      ingredient_name,
      ingredient_quantity,
      ingredient_unit,
      ingredient_unit_price,
      ingredient_index,
      now()
    );
  end loop;
end;
$$;

revoke all on function public.save_menu_item_tech_card(jsonb) from public, anon;
grant execute on function public.save_menu_item_tech_card(jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';
