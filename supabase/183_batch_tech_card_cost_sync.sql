-- Coalesce deferred per-row recipe events and stop cost propagation at convergence.
-- No historical snapshots or recipe/RPC permissions are changed.
begin;

create or replace function public.sync_menu_item_tech_card_real_costs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  card_count integer := 0;
  pass integer;
  changed_count integer;
begin
  -- Cost writes inside this function must not recursively schedule another sync.
  perform set_config('app.tech_card_cost_sync_running', 'on', true);
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
      updated_at = excluded.updated_at
    where (menu_item_costs.cost_price, menu_item_costs.variant_costs, menu_item_costs.cost_source)
      is distinct from (excluded.cost_price, excluded.variant_costs, excluded.cost_source);
    get diagnostics changed_count = row_count;
    -- Dependency chains need further passes only while protected costs change.
    exit when changed_count = 0;
  end loop;

  if exists (
    select 1 from public.menu_item_tech_cards card
    where public.calculate_menu_item_variant_tech_card_real_cost(card.menu_item_id, card.variant_option_id) is null
  ) then
    raise exception 'Every included menu item must have a real cost';
  end if;
  perform set_config('app.tech_card_cost_sync_running', 'off', true);
end;
$$;

-- Mark each new mutation, including writes after SET CONSTRAINTS ... IMMEDIATE.
create or replace function public.mark_tech_card_costs_dirty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.tech_card_costs_dirty', 'on', true);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.trigger_sync_menu_item_tech_card_real_costs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.tech_card_cost_sync_running', true), '') <> 'on' then
    if tg_table_name = 'menu_item_costs' then
      -- Manual base/variant costs also propagate to recipes that include them.
      perform public.sync_menu_item_tech_card_real_costs();
    elsif current_setting('app.tech_card_costs_dirty', true) = 'on' then
      perform set_config('app.tech_card_costs_dirty', 'off', true);
      perform public.sync_menu_item_tech_card_real_costs();
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Keep the existing deferred constraint triggers: they validate the complete
-- recipe at commit. The first event consumes the dirty flag; the rest are no-ops.
drop trigger if exists tech_cards_mark_costs_dirty on public.menu_item_tech_cards;
create trigger tech_cards_mark_costs_dirty
before insert or update or delete on public.menu_item_tech_cards
for each row execute function public.mark_tech_card_costs_dirty();

drop trigger if exists tech_card_ingredients_mark_costs_dirty on public.menu_item_tech_card_ingredients;
create trigger tech_card_ingredients_mark_costs_dirty
before insert or update or delete on public.menu_item_tech_card_ingredients
for each row execute function public.mark_tech_card_costs_dirty();

drop trigger if exists tech_card_components_mark_costs_dirty on public.menu_item_tech_card_components;
create trigger tech_card_components_mark_costs_dirty
before insert or update or delete on public.menu_item_tech_card_components
for each row execute function public.mark_tech_card_costs_dirty();

drop trigger if exists menu_item_costs_refresh_tech_cards_on_update on public.menu_item_costs;
create trigger menu_item_costs_refresh_tech_cards_on_update
after update of cost_price, variant_costs on public.menu_item_costs
for each row execute function public.trigger_sync_menu_item_tech_card_real_costs();

revoke all on function public.mark_tech_card_costs_dirty() from public, anon, authenticated;
revoke all on function public.sync_menu_item_tech_card_real_costs() from public, anon, authenticated;
revoke all on function public.trigger_sync_menu_item_tech_card_real_costs() from public, anon, authenticated;

commit;
