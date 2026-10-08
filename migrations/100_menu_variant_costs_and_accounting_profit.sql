-- Private per-variant real costs and Accounting net-profit access.
-- Variant costs never live in public menu_items/option_groups. Future sold
-- order items snapshot the selected variant cost; existing snapshots stay
-- immutable and unchanged.

alter table public.menu_item_costs
  add column if not exists variant_costs jsonb not null default '{}'::jsonb;

alter table public.menu_item_costs
  drop constraint if exists menu_item_costs_variant_costs_object;

alter table public.menu_item_costs
  add constraint menu_item_costs_variant_costs_object
  check (jsonb_typeof(variant_costs) = 'object') not valid;

alter table public.menu_item_costs
  validate constraint menu_item_costs_variant_costs_object;

drop policy if exists "feature_access_read_menu_item_costs" on public.menu_item_costs;
create policy "feature_access_read_menu_item_costs"
  on public.menu_item_costs for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard','menu','expenses']));

create or replace function public.snapshot_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never trust a client-provided cost. Prefer the selected variant's private
  -- cost, then fall back to the parent product cost. Missing legacy costs stay
  -- null so reporting can use the current protected cost as a fallback.
  new.cost_price := (
    select coalesce(
      (
        select greatest(0, (item_cost.variant_costs ->> selection.value)::integer)
        from jsonb_each_text(coalesce(new.selected_options, '{}'::jsonb)) as selection(key, value)
        where item_cost.variant_costs ? selection.value
          and (item_cost.variant_costs ->> selection.value) ~ '^[0-9]+$'
        order by selection.key
        limit 1
      ),
      item_cost.cost_price
    )
    from public.menu_item_costs as item_cost
    where item_cost.menu_item_id = new.menu_item_id
  );
  return new;
end;
$$;

revoke all on function public.snapshot_order_item_cost() from public;

notify pgrst, 'reload schema';
