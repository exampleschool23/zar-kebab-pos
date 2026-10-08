-- A saved tech card is the source of truth for the menu item's current real
-- cost. Historical order_items.cost_price snapshots remain immutable.

begin;

alter table public.menu_item_costs
  add column if not exists cost_source text not null default 'manual';

alter table public.menu_item_costs
  drop constraint if exists menu_item_costs_cost_source_valid;
alter table public.menu_item_costs
  add constraint menu_item_costs_cost_source_valid
  check (cost_source in ('manual', 'tech_card'));

comment on column public.menu_item_costs.cost_source is
  'manual when Admin Menu owns the current cost; tech_card when the saved recipe owns it.';

create or replace function public.calculate_menu_item_tech_card_real_cost(target_menu_item_id text)
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
  select card.portion_count
  into target_portion_count
  from public.menu_item_tech_cards card
  where card.menu_item_id = target_menu_item_id;

  if target_portion_count is null then
    return null;
  end if;

  select coalesce(sum(ingredient.quantity * ingredient.unit_price_uzs), 0)
  into ingredient_batch_cost
  from public.menu_item_tech_card_ingredients ingredient
  where ingredient.menu_item_id = target_menu_item_id;

  select
    coalesce(sum(component.quantity * coalesce(
      (
        select (item_cost.variant_costs ->> selected.value)::numeric
        from jsonb_each_text(component.selected_options) selected
        where item_cost.variant_costs ? selected.value
          and (item_cost.variant_costs ->> selected.value) ~ '^[0-9]+$'
        order by selected.key
        limit 1
      ),
      item_cost.cost_price::numeric
    )), 0),
    count(*) filter (where item_cost.menu_item_id is null)
  into component_cost_per_portion, missing_component_costs
  from public.menu_item_tech_card_components component
  left join public.menu_item_costs item_cost
    on item_cost.menu_item_id = component.component_menu_item_id
  where component.menu_item_id = target_menu_item_id;

  if missing_component_costs > 0 then
    return null;
  end if;

  return greatest(
    0,
    round((ingredient_batch_cost / target_portion_count) + component_cost_per_portion)
  )::bigint;
end;
$$;

revoke all on function public.calculate_menu_item_tech_card_real_cost(text)
  from public, anon, authenticated;

create or replace function public.enforce_menu_item_cost_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  calculated_cost bigint;
begin
  if exists (
    select 1
    from public.menu_item_tech_cards card
    where card.menu_item_id = new.menu_item_id
  ) then
    calculated_cost := public.calculate_menu_item_tech_card_real_cost(new.menu_item_id);
    if calculated_cost is null then
      raise exception 'Every included menu item must have a real cost';
    end if;
    new.cost_price := calculated_cost::integer;
    new.cost_source := 'tech_card';
  else
    new.cost_source := 'manual';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_menu_item_cost_source()
  from public, anon, authenticated;

drop trigger if exists menu_item_costs_enforce_source on public.menu_item_costs;
create trigger menu_item_costs_enforce_source
before insert or update of cost_price, cost_source
on public.menu_item_costs
for each row execute function public.enforce_menu_item_cost_source();

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
  set cost_source = 'manual',
      updated_at = now()
  where item_cost.cost_source = 'tech_card'
    and not exists (
      select 1
      from public.menu_item_tech_cards card
      where card.menu_item_id = item_cost.menu_item_id
    );

  select count(*) into card_count
  from public.menu_item_tech_cards;

  -- Repeating allows set/combo cards to settle after the tech-card-backed
  -- costs of their included items have been refreshed. Cycles are rejected by
  -- migration 149, so card_count + 1 passes is a safe upper bound.
  for pass in 0..card_count loop
    insert into public.menu_item_costs (
      menu_item_id,
      cost_price,
      variant_costs,
      cost_source,
      updated_at
    )
    select
      card.menu_item_id,
      calculated.cost_price::integer,
      '{}'::jsonb,
      'tech_card',
      now()
    from public.menu_item_tech_cards card
    cross join lateral (
      select public.calculate_menu_item_tech_card_real_cost(card.menu_item_id) as cost_price
    ) calculated
    where calculated.cost_price is not null
    on conflict (menu_item_id) do update set
      cost_price = excluded.cost_price,
      cost_source = 'tech_card',
      updated_at = excluded.updated_at
    where public.menu_item_costs.cost_price is distinct from excluded.cost_price
       or public.menu_item_costs.cost_source is distinct from 'tech_card';
  end loop;

  if exists (
    select 1
    from public.menu_item_tech_cards card
    where public.calculate_menu_item_tech_card_real_cost(card.menu_item_id) is null
  ) then
    raise exception 'Every included menu item must have a real cost';
  end if;
end;
$$;

revoke all on function public.sync_menu_item_tech_card_real_costs()
  from public, anon, authenticated;

create or replace function public.trigger_sync_menu_item_tech_card_real_costs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 1 then
    perform public.sync_menu_item_tech_card_real_costs();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.trigger_sync_menu_item_tech_card_real_costs()
  from public, anon, authenticated;

drop trigger if exists menu_item_costs_refresh_tech_cards_on_update on public.menu_item_costs;
create trigger menu_item_costs_refresh_tech_cards_on_update
after update of cost_price on public.menu_item_costs
for each row execute function public.trigger_sync_menu_item_tech_card_real_costs();

drop trigger if exists menu_item_costs_refresh_tech_cards_on_insert_delete on public.menu_item_costs;
create trigger menu_item_costs_refresh_tech_cards_on_insert_delete
after insert or delete on public.menu_item_costs
for each row execute function public.trigger_sync_menu_item_tech_card_real_costs();

drop trigger if exists tech_cards_sync_real_cost on public.menu_item_tech_cards;
create constraint trigger tech_cards_sync_real_cost
after insert or update or delete on public.menu_item_tech_cards
deferrable initially deferred
for each row execute function public.trigger_sync_menu_item_tech_card_real_costs();

drop trigger if exists tech_card_ingredients_sync_real_cost on public.menu_item_tech_card_ingredients;
create constraint trigger tech_card_ingredients_sync_real_cost
after insert or update or delete on public.menu_item_tech_card_ingredients
deferrable initially deferred
for each row execute function public.trigger_sync_menu_item_tech_card_real_costs();

drop trigger if exists tech_card_components_sync_real_cost on public.menu_item_tech_card_components;
create constraint trigger tech_card_components_sync_real_cost
after insert or update or delete on public.menu_item_tech_card_components
deferrable initially deferred
for each row execute function public.trigger_sync_menu_item_tech_card_real_costs();

select public.sync_menu_item_tech_card_real_costs();

commit;

notify pgrst, 'reload schema';
