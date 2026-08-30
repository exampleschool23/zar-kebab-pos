-- Snapshot each catalog normal price and the resulting purchase variance.
-- Later catalog price changes must not rewrite historical Bazaar comparisons.
begin;

alter table public.bazaar_purchase_items
  add column if not exists normal_unit_price integer not null default 0,
  add column if not exists normal_line_total bigint not null default 0,
  add column if not exists price_difference bigint not null default 0;

alter table public.bazaar_purchase_items
  drop constraint if exists bazaar_purchase_items_normal_unit_price_nonnegative,
  drop constraint if exists bazaar_purchase_items_normal_line_total_nonnegative;

alter table public.bazaar_purchase_items
  add constraint bazaar_purchase_items_normal_unit_price_nonnegative
    check (normal_unit_price >= 0),
  add constraint bazaar_purchase_items_normal_line_total_nonnegative
    check (normal_line_total >= 0);

create or replace function public.require_bazaar_catalog_ingredient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ingredient public.bazaar_product_catalog%rowtype;
  previous_item jsonb;
  snapshot_price bigint := 0;
begin
  select *
  into ingredient
  from public.bazaar_product_catalog as catalog
  where catalog.product_key = new.product_key
    and catalog.is_catalog_managed
    and catalog.is_active;

  if not found then
    raise exception 'Choose an active ingredient from the Daily Bazaar catalog';
  end if;

  -- Updates reuse the immutable price snapshot for the same durable line id.
  select prior.item
  into previous_item
  from public.bazaar_purchase_audit as audit
  cross join lateral jsonb_array_elements(coalesce(audit.new_snapshot -> 'items', '[]'::jsonb)) as prior(item)
  where audit.purchase_id = new.purchase_id
    and prior.item ->> 'id' = new.id::text
  order by audit.changed_at desc, audit.id desc
  limit 1;

  snapshot_price := coalesce(nullif(previous_item ->> 'normal_unit_price', '')::bigint, 0);
  if snapshot_price <= 0 then
    snapshot_price := ingredient.normal_unit_price;
  end if;
  if snapshot_price <= 0 then
    raise exception 'The selected Bazaar ingredient needs a normal unit price';
  end if;

  new.product_name := ingredient.product_name;
  new.category := ingredient.category;
  new.unit := ingredient.unit;
  new.normal_unit_price := snapshot_price::integer;
  new.normal_line_total := round(new.quantity * snapshot_price)::bigint;
  new.price_difference := new.line_total::bigint - new.normal_line_total;
  return new;
end;
$$;

revoke all on function public.require_bazaar_catalog_ingredient() from public, anon, authenticated;

commit;
