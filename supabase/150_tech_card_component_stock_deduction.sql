-- Deduct structured set/combo contents from shelf stock in the same exactly-once
-- paid-order transition that deducts the sold parent item. The immutable snapshot
-- captured on order_items is authoritative; later Tech Card edits cannot change
-- stock movements for an existing order.

begin;

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
  component jsonb;
  component_quantity numeric;
  component_stock_quantity integer;
begin
  old_paid := old.payment_status = 'paid'
    or old.status in ('paid', 'completed')
    or old.paid_at is not null;
  new_paid := new.payment_status = 'paid'
    or new.status in ('paid', 'completed')
    or new.paid_at is not null;

  -- This marker covers both the parent product and every snapshotted component.
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
      oi.selected_options,
      oi.tech_card_component_snapshot
    from public.order_items oi
    where oi.order_id = new.id
      and coalesce(oi.status, '') <> 'cancelled'
      and coalesce(oi.sale_unit, 'piece') = 'piece'
      and oi.quantity > 0
    order by oi.id
  loop
    sold_quantity := trunc(sold_item.quantity)::integer;

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

    for component in
      select value
      from jsonb_array_elements(
        case
          when jsonb_typeof(sold_item.tech_card_component_snapshot) = 'array'
            then sold_item.tech_card_component_snapshot
          else '[]'::jsonb
        end
      )
    loop
      if coalesce(component ->> 'sale_unit', 'piece') <> 'piece' then
        continue;
      end if;

      component_quantity := case
        when coalesce(component ->> 'quantity', '') ~ '^\d+(\.\d+)?$'
          then (component ->> 'quantity')::numeric
        else 0
      end;

      -- Piece quantities are validated when the Tech Card is saved. Keep this
      -- defensive check so malformed legacy snapshots can never round stock.
      if component_quantity <= 0 or component_quantity <> trunc(component_quantity) then
        continue;
      end if;

      component_stock_quantity := sold_quantity * component_quantity::integer;

      update public.menu_items
      set stock_count = case
        when stock_count > 0 then greatest(stock_count - component_stock_quantity, 0)
        else stock_count
      end
      where id = nullif(component ->> 'menu_item_id', '');
    end loop;
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

commit;

notify pgrst, 'reload schema';
