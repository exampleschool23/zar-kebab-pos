-- Game Club is an independent off-premise channel. Never relabel old sales.
begin;

alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check
  check (order_type in ('dine_in', 'take_away', 'delivery', 'game_club'));
alter table public.order_items drop constraint if exists order_items_order_type_check;
alter table public.order_items add constraint order_items_order_type_check
  check (order_type in ('dine_in', 'take_away', 'delivery', 'game_club'));

-- Retain all intervening payment, locking, audit and recovery fixes while
-- extending the existing off-premise checks. Abort on an unexpected contract.
-- Migration 090 retired order reopening; only patch the current entry points.
do $$
declare
  signature text;
  definition text;
begin
  foreach signature in array array[
    'public.submit_order_to_kitchen(jsonb)',
    'public.settle_orders_payment_strict(jsonb)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Required function % missing; apply earlier migrations', signature;
    end if;
    definition := pg_get_functiondef(to_regprocedure(signature));
    if position('''take_away'', ''delivery'', ''game_club''' in definition) > 0 then
      continue;
    end if;
    if position('''take_away'', ''delivery''' in definition) = 0 then
      raise exception 'Unexpected off-premise contract in %', signature;
    end if;
    execute replace(definition, '''take_away'', ''delivery''', '''take_away'', ''delivery'', ''game_club''');
  end loop;
end $$;

commit;
