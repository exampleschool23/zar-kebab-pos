-- Deduct manually tracked shelf stock exactly once when an order becomes paid.
-- Existing paid orders are marked as already processed so applying this migration
-- never rewrites current shelf counts from historical sales.

alter table public.orders
  add column if not exists stock_deducted_at timestamptz;

update public.orders
set stock_deducted_at = coalesce(paid_at, updated_at, created_at, now())
where stock_deducted_at is null
  and (
    payment_status = 'paid'
    or status in ('paid', 'completed')
    or paid_at is not null
  );

create or replace function public.decrement_selected_variant_stock(
  current_groups jsonb,
  selected_options jsonb,
  sold_quantity integer
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  group_row record;
  option_row record;
  group_value jsonb;
  option_value jsonb;
  rebuilt_groups jsonb := '[]'::jsonb;
  rebuilt_options jsonb;
  selected_option_id text;
  option_stock integer;
  quantity_to_deduct integer := greatest(coalesce(sold_quantity, 0), 0);
begin
  if jsonb_typeof(current_groups) is distinct from 'array'
     or quantity_to_deduct = 0 then
    return current_groups;
  end if;

  for group_row in
    select value, ordinality
    from jsonb_array_elements(current_groups) with ordinality
    order by ordinality
  loop
    group_value := group_row.value;
    selected_option_id := coalesce(selected_options, '{}'::jsonb) ->> (group_value ->> 'id');

    if selected_option_id is null
       or jsonb_typeof(group_value -> 'options') is distinct from 'array' then
      rebuilt_groups := rebuilt_groups || jsonb_build_array(group_value);
      continue;
    end if;

    rebuilt_options := '[]'::jsonb;
    for option_row in
      select value, ordinality
      from jsonb_array_elements(group_value -> 'options') with ordinality
      order by ordinality
    loop
      option_value := option_row.value;
      option_stock := case
        when coalesce(option_value ->> 'stock_count', '') ~ '^[0-9]+$'
          then (option_value ->> 'stock_count')::integer
        else 0
      end;

      if option_value ->> 'id' = selected_option_id and option_stock > 0 then
        option_value := jsonb_set(
          option_value,
          '{stock_count}',
          to_jsonb(greatest(option_stock - quantity_to_deduct, 0)),
          true
        );
      end if;

      rebuilt_options := rebuilt_options || jsonb_build_array(option_value);
    end loop;

    rebuilt_groups := rebuilt_groups || jsonb_build_array(
      jsonb_set(group_value, '{options}', rebuilt_options, true)
    );
  end loop;

  return rebuilt_groups;
end;
$$;

revoke all on function public.decrement_selected_variant_stock(jsonb, jsonb, integer)
  from public, anon, authenticated;

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
begin
  old_paid := old.payment_status = 'paid'
    or old.status in ('paid', 'completed')
    or old.paid_at is not null;
  new_paid := new.payment_status = 'paid'
    or new.status in ('paid', 'completed')
    or new.paid_at is not null;

  -- The processing marker is immutable. It also prevents a retry or a later
  -- payment-method correction from subtracting the same stock again.
  if old.stock_deducted_at is not null then
    new.stock_deducted_at := old.stock_deducted_at;
    return new;
  end if;

  if old_paid or not new_paid then
    new.stock_deducted_at := null;
    return new;
  end if;

  for sold_item in
    select
      oi.menu_item_id,
      oi.quantity,
      oi.selected_options
    from public.order_items oi
    where oi.order_id = new.id
      and coalesce(oi.status, '') <> 'cancelled'
      and coalesce(oi.sale_unit, 'piece') = 'piece'
      and oi.quantity > 0
    order by oi.id
  loop
    sold_quantity := sold_item.quantity::integer;

    update public.menu_items
    set
      stock_count = case
        when stock_count > 0 then greatest(stock_count - sold_quantity, 0)
        else stock_count
      end,
      option_groups = public.decrement_selected_variant_stock(
        option_groups,
        sold_item.selected_options,
        sold_quantity
      )
    where id = sold_item.menu_item_id;
  end loop;

  new.stock_deducted_at := now();
  return new;
end;
$$;

revoke all on function public.apply_paid_order_stock() from public, anon, authenticated;

drop trigger if exists apply_paid_order_stock on public.orders;
create trigger apply_paid_order_stock
before update on public.orders
for each row execute function public.apply_paid_order_stock();

notify pgrst, 'reload schema';
