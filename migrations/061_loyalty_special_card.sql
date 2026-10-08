do $$ begin
  alter table public.loyalty_cards
    drop constraint if exists loyalty_cards_cashback_type_check;
exception when undefined_table then
  null;
end $$;

alter table if exists public.loyalty_cards
  add constraint loyalty_cards_cashback_type_check
  check (cashback_type in ('bronze', 'silver', 'gold', 'premium', 'black', 'special'));

do $$ begin
  alter table public.loyalty_transactions
    drop constraint if exists loyalty_transactions_card_type_at_transaction_check;
exception when undefined_table then
  null;
end $$;

alter table if exists public.loyalty_transactions
  add constraint loyalty_transactions_card_type_at_transaction_check
  check (
    card_type_at_transaction is null or
    card_type_at_transaction in ('bronze', 'silver', 'gold', 'premium', 'black', 'special')
  );
