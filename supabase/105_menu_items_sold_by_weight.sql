-- Menu products can be sold either as whole items or by decimal kilogram weight.
-- Price and protected cost stay expressed per sale unit. Order items snapshot the
-- unit so receipts and historical reports remain correct after later menu edits.

alter table public.menu_items
  add column if not exists sale_unit text not null default 'piece';

update public.menu_items
set sale_unit = 'piece'
where sale_unit is null or sale_unit not in ('piece', 'kg');

alter table public.menu_items
  drop constraint if exists menu_items_sale_unit_valid;
alter table public.menu_items
  add constraint menu_items_sale_unit_valid
  check (sale_unit in ('piece', 'kg'));

alter table public.order_items
  add column if not exists sale_unit text;

-- Historical orders predate weight-based sales, so they are pieces. Normalize
-- through ALTER COLUMN rather than UPDATE: paid order items are intentionally
-- protected by guard_paid_order_items and must remain immutable.
alter table public.order_items
  drop constraint if exists order_items_sale_unit_valid,
  drop constraint if exists order_items_quantity_matches_sale_unit;

alter table public.order_items
  alter column sale_unit type text using (
    case when sale_unit = 'kg' then 'kg' else 'piece' end
  ),
  alter column sale_unit set default 'piece',
  alter column sale_unit set not null,
  alter column quantity type numeric(12,3) using quantity::numeric;

alter table public.order_items
  add constraint order_items_sale_unit_valid
  check (sale_unit in ('piece', 'kg'));

alter table public.order_items
  add constraint order_items_quantity_matches_sale_unit
  check (sale_unit = 'kg' or quantity = trunc(quantity));

create or replace function public.snapshot_order_item_sale_unit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_sale_unit text;
begin
  if tg_op = 'INSERT' or new.menu_item_id is distinct from old.menu_item_id then
    select mi.sale_unit
      into current_sale_unit
      from public.menu_items mi
     where mi.id = new.menu_item_id;

    new.sale_unit := case
      when current_sale_unit in ('piece', 'kg') then current_sale_unit
      when new.sale_unit = 'kg' then 'kg'
      else 'piece'
    end;
  elsif new.sale_unit not in ('piece', 'kg') then
    new.sale_unit := old.sale_unit;
  end if;

  if new.quantity <= 0 then
    raise exception 'Order item quantity must be greater than zero' using errcode = '23514';
  end if;
  if new.sale_unit = 'piece' and new.quantity <> trunc(new.quantity) then
    raise exception 'Piece quantities must be whole numbers' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_snapshot_sale_unit on public.order_items;
create trigger order_items_snapshot_sale_unit
before insert or update of menu_item_id, sale_unit, quantity
on public.order_items
for each row execute function public.snapshot_order_item_sale_unit();

-- The current kitchen and Telegram RPCs parse JSON quantities as integers.
-- Rebuild their installed definitions with numeric quantities while retaining
-- all validation/idempotency behavior from the latest applied migrations.
do $migration$
declare
  function_definition text;
  target_function regprocedure;
begin
  target_function := to_regprocedure('public.submit_order_to_kitchen(jsonb)');
  if target_function is null then
    raise exception 'submit_order_to_kitchen(jsonb) is missing; apply migration 096 first';
  end if;
  select pg_get_functiondef(target_function) into function_definition;
  if position('quantity integer,' in function_definition) > 0 then
    function_definition := replace(function_definition, 'quantity integer,', 'quantity numeric,');
    execute function_definition;
  elsif position('quantity numeric,' in function_definition) = 0 then
    raise exception 'Could not upgrade submit_order_to_kitchen quantity parser';
  end if;

  target_function := to_regprocedure('public.create_telegram_order(jsonb)');
  if target_function is null then
    raise exception 'create_telegram_order(jsonb) is missing; apply migration 101 first';
  end if;
  select pg_get_functiondef(target_function) into function_definition;
  if position('quantity integer,' in function_definition) > 0 then
    function_definition := replace(function_definition, 'quantity integer,', 'quantity numeric,');
    execute function_definition;
  elsif position('quantity numeric,' in function_definition) = 0 then
    raise exception 'Could not upgrade create_telegram_order quantity parser';
  end if;

  -- Settlement and owner reopen recompute totals from order items. Preserve the
  -- decimal quantity until the final UZS total is rounded. Migration 087 wraps
  -- the real settlement body in settle_orders_payment_strict, so upgrade that
  -- function when present and support databases that have not applied 087 yet.
  target_function := coalesce(
    to_regprocedure('public.settle_orders_payment_strict(jsonb)'),
    to_regprocedure('public.settle_orders_payment(jsonb)')
  );
  if target_function is null then
    raise exception 'Payment settlement function is missing; apply migration 083 first';
  end if;
  select pg_get_functiondef(target_function) into function_definition;
  if position('greatest(coalesce(oi.quantity, 1), 1)::bigint' in function_definition) > 0 then
    function_definition := replace(
      function_definition,
      'greatest(coalesce(oi.quantity, 1), 1)::bigint',
      'greatest(coalesce(oi.quantity, 1), 0)::numeric'
    );
    execute function_definition;
  elsif position('greatest(coalesce(oi.quantity, 1), 0)::numeric' in function_definition) = 0 then
    raise exception 'Could not upgrade settle_orders_payment quantity calculation';
  end if;

  -- Migration 090 intentionally removes this legacy owner-reopen function.
  -- Upgrade it only on older databases where it still exists.
  target_function := to_regprocedure('public.reopen_paid_orders_owner(text[])');
  if target_function is not null then
    select pg_get_functiondef(target_function) into function_definition;
    if position('greatest(coalesce(oi.quantity, 1), 1)::bigint' in function_definition) > 0 then
      function_definition := replace(
        function_definition,
        'greatest(coalesce(oi.quantity, 1), 1)::bigint',
        'greatest(coalesce(oi.quantity, 1), 0)::numeric'
      );
      execute function_definition;
    elsif position('greatest(coalesce(oi.quantity, 1), 0)::numeric' in function_definition) = 0 then
      raise exception 'Could not upgrade reopen_paid_orders_owner quantity calculation';
    end if;
  end if;
end;
$migration$;

-- Keep product creation atomic while persisting the new public sale unit.
create or replace function public.create_menu_item_with_media_and_cost(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_item jsonb;
  inserted_id text;
  normalized_media_urls text[] := array[]::text[];
  normalized_sale_unit text := case when payload ->> 'sale_unit' = 'kg' then 'kg' else 'piece' end;
  updated_item public.menu_items%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'A menu item payload is required' using errcode = '22023';
  end if;

  if payload ? 'media_urls'
     and jsonb_typeof(payload -> 'media_urls') is distinct from 'array' then
    raise exception 'Menu media URLs must be an array' using errcode = '22023';
  end if;

  select coalesce(
    array_agg(media_url order by first_position),
    array[]::text[]
  )
  into normalized_media_urls
  from (
    select
      btrim(media.value) as media_url,
      min(media.position) as first_position
    from jsonb_array_elements_text(coalesce(payload -> 'media_urls', '[]'::jsonb))
      with ordinality as media(value, position)
    where nullif(btrim(media.value), '') is not null
    group by btrim(media.value)
  ) normalized;

  if cardinality(normalized_media_urls) = 0
     and nullif(btrim(payload ->> 'image_url'), '') is not null then
    normalized_media_urls := array[btrim(payload ->> 'image_url')];
  end if;

  inserted_item := public.create_menu_item_with_cost(
    payload || jsonb_build_object(
      'image_url',
      coalesce(normalized_media_urls[1], '')
    )
  );
  inserted_id := inserted_item ->> 'id';

  update public.menu_items
  set
    image_url = coalesce(normalized_media_urls[1], ''),
    media_urls = normalized_media_urls,
    sale_unit = normalized_sale_unit
  where id = inserted_id
  returning * into updated_item;

  if updated_item.id is null then
    raise exception 'Created menu item could not be updated with media'
      using errcode = 'P0001';
  end if;

  return to_jsonb(updated_item);
end;
$$;

revoke all on function public.create_menu_item_with_media_and_cost(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_menu_item_with_media_and_cost(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
