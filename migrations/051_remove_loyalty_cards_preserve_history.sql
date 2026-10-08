-- Remove loyalty cards without deleting historical wallet transactions.
-- This frees the physical card number for reuse while preserving reports/history.

alter table public.loyalty_transactions
  add column if not exists card_number_at_transaction text,
  add column if not exists customer_name_at_transaction text not null default '',
  add column if not exists phone_number_at_transaction text not null default '';

update public.loyalty_transactions tx
set
  card_number_at_transaction = coalesce(tx.card_number_at_transaction, c.card_number),
  customer_name_at_transaction = coalesce(nullif(tx.customer_name_at_transaction, ''), c.customer_name, ''),
  phone_number_at_transaction = coalesce(nullif(tx.phone_number_at_transaction, ''), c.phone_number, '')
from public.loyalty_cards c
where tx.loyalty_card_id = c.id;

alter table public.loyalty_transactions
  alter column loyalty_card_id drop not null;

alter table public.loyalty_transactions
  drop constraint if exists loyalty_transactions_loyalty_card_id_fkey;

alter table public.loyalty_transactions
  add constraint loyalty_transactions_loyalty_card_id_fkey
  foreign key (loyalty_card_id)
  references public.loyalty_cards(id)
  on delete set null;

create or replace function public.remove_loyalty_card(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.loyalty_cards%rowtype;
  v_transaction_count integer := 0;
begin
  if not public.current_staff_has_role(array['owner']) then
    raise exception 'Only owner can remove loyalty cards' using errcode = '42501';
  end if;

  select *
    into v_card
    from public.loyalty_cards
   where id = p_card_id
   for update;

  if not found then
    raise exception 'Loyalty card not found' using errcode = 'P0002';
  end if;

  update public.loyalty_transactions
     set card_number_at_transaction = coalesce(card_number_at_transaction, v_card.card_number),
         customer_name_at_transaction = coalesce(nullif(customer_name_at_transaction, ''), v_card.customer_name, ''),
         phone_number_at_transaction = coalesce(nullif(phone_number_at_transaction, ''), v_card.phone_number, '')
   where loyalty_card_id = v_card.id;

  get diagnostics v_transaction_count = row_count;

  delete from public.loyalty_cards
   where id = v_card.id;

  return jsonb_build_object(
    'removed_card_id', v_card.id,
    'card_number', v_card.card_number,
    'customer_name', v_card.customer_name,
    'phone_number', v_card.phone_number,
    'preserved_transactions', v_transaction_count
  );
end;
$$;

revoke all on function public.remove_loyalty_card(uuid) from public;
grant execute on function public.remove_loyalty_card(uuid) to authenticated;
grant execute on function public.remove_loyalty_card(uuid) to service_role;

