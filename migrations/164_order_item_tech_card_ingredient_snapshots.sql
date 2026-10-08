-- Freeze protected ingredient quantities and prices for each newly sold item in
-- a service-only table. Existing order items intentionally remain uncovered:
-- current recipes must never be fabricated as historical recipe data.

begin;

create table if not exists public.order_item_tech_card_ingredient_snapshots (
  order_item_id uuid primary key references public.order_items(id) on delete cascade,
  ingredients jsonb not null default '[]'::jsonb,
  is_complete boolean not null default false,
  captured_at timestamptz not null default now()
);

comment on table public.order_item_tech_card_ingredient_snapshots is
  'Service-only immutable ingredient and price snapshots used for theoretical consumption reports.';

alter table public.order_item_tech_card_ingredient_snapshots enable row level security;
revoke all on table public.order_item_tech_card_ingredient_snapshots from anon, authenticated;

create or replace function public.build_tech_card_ingredient_snapshot(
  target_menu_item_id text,
  target_variant_option_id text default '',
  quantity_multiplier numeric default 1,
  visited_menu_items text[] default '{}'::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  card_portion_count numeric;
  result jsonb := '[]'::jsonb;
  ingredient record;
  component record;
  component_variant_option_id text := '';
begin
  if target_menu_item_id is null or target_menu_item_id = any(visited_menu_items) then
    return jsonb_build_array(jsonb_build_object(
      'snapshot_status', 'missing_or_cyclic_recipe',
      'menu_item_id', target_menu_item_id
    ));
  end if;

  select card.portion_count into card_portion_count
  from public.menu_item_tech_cards card
  where card.menu_item_id = target_menu_item_id
    and card.variant_option_id = coalesce(target_variant_option_id, '');

  if card_portion_count is null then
    return jsonb_build_array(jsonb_build_object(
      'snapshot_status', 'missing_recipe',
      'menu_item_id', target_menu_item_id
    ));
  end if;

  for ingredient in
    select row.*
    from public.menu_item_tech_card_ingredients row
    where row.menu_item_id = target_menu_item_id
      and row.variant_option_id = coalesce(target_variant_option_id, '')
    order by row.sort_order, row.id
  loop
    result := result || jsonb_build_array(jsonb_build_object(
      'snapshot_status', 'captured',
      'name', ingredient.name,
      'quantity_per_portion', (ingredient.quantity / card_portion_count) * quantity_multiplier,
      'unit', ingredient.unit,
      'unit_price_uzs', ingredient.unit_price_uzs,
      'source_menu_item_id', ingredient.menu_item_id,
      'variant_option_id', ingredient.variant_option_id
    ));
  end loop;

  for component in
    select row.*
    from public.menu_item_tech_card_components row
    where row.menu_item_id = target_menu_item_id
      and row.variant_option_id = coalesce(target_variant_option_id, '')
    order by row.sort_order, row.id
  loop
    component_variant_option_id := '';
    select card.variant_option_id into component_variant_option_id
    from public.menu_item_tech_cards card
    where card.menu_item_id = component.component_menu_item_id
      and (
        card.variant_option_id = ''
        or card.variant_option_id in (
          select value from jsonb_each_text(coalesce(component.selected_options, '{}'::jsonb))
        )
      )
    order by (card.variant_option_id <> '') desc
    limit 1;

    result := result || public.build_tech_card_ingredient_snapshot(
      component.component_menu_item_id,
      coalesce(component_variant_option_id, ''),
      quantity_multiplier * component.quantity,
      visited_menu_items || target_menu_item_id
    );
  end loop;

  return result;
end;
$$;

revoke all on function public.build_tech_card_ingredient_snapshot(text, text, numeric, text[])
  from public, anon, authenticated;

create or replace function public.snapshot_order_item_tech_card_ingredients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_variant_option_id text := '';
  ingredient_snapshot jsonb;
begin
  select card.variant_option_id into target_variant_option_id
  from public.menu_item_tech_cards card
  where card.menu_item_id = new.menu_item_id
    and (
      card.variant_option_id = ''
      or card.variant_option_id in (
        select value from jsonb_each_text(coalesce(new.selected_options, '{}'::jsonb))
      )
    )
  order by (card.variant_option_id <> '') desc
  limit 1;

  ingredient_snapshot := public.build_tech_card_ingredient_snapshot(
    new.menu_item_id,
    coalesce(target_variant_option_id, '')
  );

  insert into public.order_item_tech_card_ingredient_snapshots (
    order_item_id, ingredients, is_complete, captured_at
  ) values (
    new.id,
    ingredient_snapshot,
    not jsonb_path_exists(ingredient_snapshot, '$[*] ? (@.snapshot_status != "captured")'),
    now()
  ) on conflict (order_item_id) do nothing;

  return new;
end;
$$;

drop trigger if exists order_items_snapshot_tech_card_ingredients on public.order_items;
create trigger order_items_snapshot_tech_card_ingredients
after insert on public.order_items
for each row execute function public.snapshot_order_item_tech_card_ingredients();

commit;

notify pgrst, 'reload schema';
