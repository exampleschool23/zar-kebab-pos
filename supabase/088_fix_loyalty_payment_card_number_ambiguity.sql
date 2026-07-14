-- Fix PostgreSQL 42702 during atomic payments with a loyalty card.
--
-- Migration 083 used `card_number` for both a PL/pgSQL variable and the
-- loyalty_cards.card_number column. Migration 087 renamed that function to
-- settle_orders_payment_strict, so patch the deployed strict function in place
-- without duplicating its large, security-sensitive settlement body here.

do $$
declare
  strict_definition text;
  fixed_definition text;
begin
  select pg_get_functiondef(
    to_regprocedure('public.settle_orders_payment_strict(jsonb)')
  ) into strict_definition;

  if strict_definition is null then
    raise exception 'settle_orders_payment_strict(jsonb) is missing; apply migration 087 first';
  end if;

  -- Fresh databases already receive the unambiguous variable name from 083.
  if position('card_number text :=' in strict_definition) = 0 then
    return;
  end if;

  fixed_definition := replace(
    strict_definition,
    'card_number text :=',
    'loyalty_card_number_value text :='
  );
  fixed_definition := replace(
    fixed_definition,
    'if card_number is null',
    'if loyalty_card_number_value is null'
  );
  fixed_definition := replace(
    fixed_definition,
    'if card_number is not null',
    'if loyalty_card_number_value is not null'
  );
  fixed_definition := replace(
    fixed_definition,
    'where c.card_number = card_number',
    'where c.card_number = loyalty_card_number_value'
  );
  fixed_definition := replace(
    fixed_definition,
    'loyalty_card_number = card_number',
    'loyalty_card_number = loyalty_card_number_value'
  );

  if position('where c.card_number = card_number' in fixed_definition) > 0
     or position('card_number text :=' in fixed_definition) > 0 then
    raise exception 'Could not safely rewrite ambiguous loyalty card variable';
  end if;

  execute fixed_definition;
end;
$$;

revoke all on function public.settle_orders_payment_strict(jsonb) from public;
revoke all on function public.settle_orders_payment_strict(jsonb) from authenticated;

notify pgrst, 'reload schema';
