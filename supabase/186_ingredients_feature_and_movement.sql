-- Independent delegated ingredient access and bounded, protected movement totals.
begin;


alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or (
      feature_access <@ array[
        'dashboard', 'tables', 'menu', 'cashier', 'loyalty', 'expenses',
        'bazaar', 'ingredients', 'tech_cards', 'team', 'reports', 'audit', 'settings',
        'off_premise_orders', 'delete_paid_orders'
      ]::text[]
      and (
        not ('off_premise_orders' = any(feature_access))
        or 'tables' = any(feature_access)
      )
      and (
        not ('delete_paid_orders' = any(feature_access))
        or feature_access && array['dashboard', 'cashier', 'reports']::text[]
      )
    )
  );


create or replace function public.current_staff_can_manage_bazaar_ingredients()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select p.status::text = 'active'
    and p.role::text in ('owner', 'admin')
    and public.current_staff_can_access('ingredients')
    from public.profiles p where p.id = auth.uid()), false);
$$;

drop policy if exists bazaar_feature_read_product_catalog on public.bazaar_product_catalog;
create policy bazaar_feature_read_product_catalog on public.bazaar_product_catalog
for select to authenticated using (
  public.current_staff_can_access('ingredients')
  or public.current_staff_can_access('bazaar')
  or public.current_staff_can_access('tech_cards')
);

-- Resolve names only when there is one unambiguous canonical identity. Legacy
-- unmatched names remain separate; never invent a recipe or rewrite snapshots.
create or replace function public.ingredient_catalog_key(ingredient_name text)
returns text language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then min(c.product_key) else null end
  from public.bazaar_product_catalog c
  where c.is_catalog_managed and (
    c.product_key = public.normalize_bazaar_product_key(ingredient_name)
    or public.normalize_bazaar_product_key(c.product_name) = public.normalize_bazaar_product_key(ingredient_name)
  );
$$;
revoke all on function public.ingredient_catalog_key(text) from public, anon, authenticated;

-- Future snapshots retain identity across later catalog renames. Nested recipes
-- call this same function, so their ingredients receive the same identity.
do $$
declare definition text := pg_get_functiondef('public.build_tech_card_ingredient_snapshot(text,text,numeric,text[])'::regprocedure);
begin
  if position('''product_key'', public.ingredient_catalog_key(ingredient.name)' in definition) = 0 then
    if position('''name'', ingredient.name,' in definition) = 0 then
      raise exception 'Ingredient snapshot function prerequisite is missing';
    end if;
    definition := replace(definition, '''name'', ingredient.name,',
      '''name'', ingredient.name, ''product_key'', public.ingredient_catalog_key(ingredient.name),');
    execute definition;
  end if;
end $$;

create or replace function public.get_ingredient_movement(p_date_from date, p_date_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if public.current_staff_can_access('ingredients') is not true then
    raise exception 'Ingredients access required' using errcode = '42501';
  end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from or p_date_to - p_date_from > 365 then
    raise exception 'Choose a date range of at most 366 days';
  end if;
  with sales as materialized (
    select i.quantity, s.ingredients, s.is_complete
    from public.orders o join public.order_items i on i.order_id = o.id
    left join public.order_item_tech_card_ingredient_snapshots s on s.order_item_id = i.id
    where o.payment_status = 'paid' and o.status <> 'cancelled' and i.status <> 'cancelled'
      and o.paid_at >= (p_date_from::timestamp at time zone 'Asia/Tashkent')
      and o.paid_at < ((p_date_to + 1)::timestamp at time zone 'Asia/Tashkent')
      and i.quantity > 0
  ), used as (
    select coalesce(nullif(j->>'product_key', ''), public.ingredient_catalog_key(j->>'name')) as product_key,
      j->>'name' as name, j->>'unit' as unit,
      (j->>'quantity_per_portion')::numeric * s.quantity as used_quantity
    from sales s cross join lateral jsonb_array_elements(coalesce(s.ingredients, '[]'::jsonb)) j
    where coalesce(j->>'snapshot_status', 'captured') = 'captured'
      and (j->>'quantity_per_portion')::numeric > 0
  ), movements as (
    select i.product_key, i.product_name as name, i.unit,
      i.quantity as bought, 0::numeric as used, i.line_total::numeric as paid
    from public.bazaar_purchase_items i join public.bazaar_purchases p on p.id = i.purchase_id
    where p.purchase_date between p_date_from and p_date_to
    union all
    select product_key, name, unit, 0, used_quantity, 0 from used
  ), normalized as (
    select coalesce(m.product_key, 'unmatched:' || public.normalize_bazaar_product_key(m.name)) as identity,
      m.product_key, coalesce(c.product_name, m.name) as name,
      case m.unit when 'g' then 'kg' when 'ml' then 'l' when 'pcs' then 'piece' else m.unit end as unit,
      m.bought * case when m.unit in ('g', 'ml') then 0.001 else 1 end as bought,
      m.used * case when m.unit in ('g', 'ml') then 0.001 else 1 end as used,
      m.paid
    from movements m left join public.bazaar_product_catalog c on c.product_key = m.product_key
  ), totals as (
    select identity, min(name) as name, unit, bool_or(product_key is null) as unmatched,
      sum(bought) as bought, sum(used) as used, sum(bought) - sum(used) as movement, sum(paid) as paid
    from normalized group by identity, unit
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(t) order by name, unit) from totals t), '[]'::jsonb),
    'uncovered_items', (select count(*) from sales where is_complete is distinct from true),
    'covered_items', (select count(*) from sales where is_complete is true)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_ingredient_movement(date, date) from public, anon;
grant execute on function public.get_ingredient_movement(date, date) to authenticated;

commit;
