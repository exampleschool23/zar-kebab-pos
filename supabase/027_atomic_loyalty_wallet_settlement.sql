-- Atomic loyalty wallet settlement for paid orders.
-- This locks the loyalty card row, validates the expected balance, updates totals,
-- and writes immutable wallet transactions in one PostgreSQL transaction.

create or replace function public.settle_loyalty_wallet_payment(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_card_id uuid := nullif(payload->>'card_id', '')::uuid;
  target_card_number text := nullif(payload->>'card_number', '');
  expected_balance integer := coalesce((payload->>'expected_balance')::integer, 0);
  final_balance integer := coalesce((payload->>'final_balance')::integer, 0);
  redeemed_total integer := coalesce((payload->>'total_redeemed')::integer, 0);
  cashback_total integer := coalesce((payload->>'total_cashback')::integer, 0);
  paid_at timestamptz := coalesce(nullif(payload->>'paid_at', '')::timestamptz, now());
  tx jsonb;
  locked_card public.loyalty_cards%rowtype;
begin
  if target_card_id is null and target_card_number is null then
    raise exception 'loyalty card is required';
  end if;

  select *
    into locked_card
    from public.loyalty_cards
   where (target_card_id is not null and id = target_card_id)
      or (target_card_id is null and card_number = target_card_number)
   for update;

  if not found or locked_card.is_active = false then
    raise exception 'loyalty card is not active';
  end if;

  if locked_card.balance <> expected_balance then
    raise exception 'loyalty balance changed. refresh and try again';
  end if;

  if redeemed_total < 0 or cashback_total < 0 or final_balance < 0 then
    raise exception 'invalid loyalty settlement amounts';
  end if;

  if locked_card.balance - redeemed_total + cashback_total <> final_balance then
    raise exception 'loyalty settlement balance mismatch';
  end if;

  update public.loyalty_cards
     set balance = final_balance,
         total_earned = coalesce(total_earned, 0) + cashback_total,
         total_redeemed = coalesce(total_redeemed, 0) + redeemed_total,
         updated_at = paid_at
   where id = locked_card.id;

  for tx in select * from jsonb_array_elements(coalesce(payload->'transactions', '[]'::jsonb))
  loop
    insert into public.loyalty_transactions (
      loyalty_card_id,
      order_id,
      type,
      amount,
      balance_before,
      balance_after,
      reason,
      cashback_percent_used,
      card_type_at_transaction,
      created_at
    ) values (
      locked_card.id,
      nullif(tx->>'order_id', ''),
      tx->>'type',
      coalesce((tx->>'amount')::integer, 0),
      coalesce((tx->>'balance_before')::integer, 0),
      coalesce((tx->>'balance_after')::integer, 0),
      nullif(tx->>'reason', ''),
      nullif(tx->>'cashback_percent_used', '')::integer,
      nullif(tx->>'card_type_at_transaction', ''),
      paid_at
    );
  end loop;

  return jsonb_build_object(
    'card_id', locked_card.id,
    'balance_before', expected_balance,
    'balance_after', final_balance,
    'total_redeemed', redeemed_total,
    'total_cashback', cashback_total
  );
end;
$$;

grant execute on function public.settle_loyalty_wallet_payment(jsonb) to authenticated;
