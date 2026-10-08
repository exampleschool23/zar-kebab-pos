-- Owner-only loyalty transaction deletion for test/correction cleanup.
-- Recomputes the card wallet balance and transaction balance snapshots after delete.

create or replace function public.delete_loyalty_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted public.loyalty_transactions%rowtype;
  v_card public.loyalty_cards%rowtype;
  v_tx public.loyalty_transactions%rowtype;
  v_start_balance integer := 0;
  v_balance integer := 0;
  v_before integer := 0;
  v_after integer := 0;
  v_delta integer := 0;
  v_total_earned integer := 0;
  v_total_redeemed integer := 0;
begin
  if not public.current_staff_has_role(array['owner']) then
    raise exception 'Only owner can delete loyalty transactions' using errcode = '42501';
  end if;

  select *
  into v_deleted
  from public.loyalty_transactions
  where id = p_transaction_id;

  if not found then
    raise exception 'Loyalty transaction not found' using errcode = 'P0002';
  end if;

  select *
  into v_card
  from public.loyalty_cards
  where id = v_deleted.loyalty_card_id
  for update;

  if not found then
    raise exception 'Loyalty card not found' using errcode = 'P0002';
  end if;

  select coalesce(balance_before, 0)
  into v_start_balance
  from public.loyalty_transactions
  where loyalty_card_id = v_deleted.loyalty_card_id
  order by created_at asc, id asc
  limit 1;

  v_balance := coalesce(v_start_balance, 0);
  v_total_earned := v_balance;

  delete from public.loyalty_transactions
  where id = p_transaction_id;

  for v_tx in
    select *
    from public.loyalty_transactions
    where loyalty_card_id = v_deleted.loyalty_card_id
    order by created_at asc, id asc
  loop
    if v_tx.balance_before is not null and v_tx.balance_after is not null then
      v_delta := v_tx.balance_after - v_tx.balance_before;
    elsif v_tx.type = 'redeemed' then
      v_delta := -abs(v_tx.amount);
    else
      v_delta := v_tx.amount;
    end if;

    v_before := v_balance;
    v_after := v_before + v_delta;
    if v_after < 0 then
      raise exception 'Deleting this transaction would make loyalty balance negative' using errcode = '23514';
    end if;

    update public.loyalty_transactions
    set balance_before = v_before,
        balance_after = v_after
    where id = v_tx.id;

    v_balance := v_after;
    if v_delta > 0 then
      v_total_earned := v_total_earned + v_delta;
    elsif v_delta < 0 then
      v_total_redeemed := v_total_redeemed + abs(v_delta);
    end if;
  end loop;

  update public.loyalty_cards
  set balance = v_balance,
      total_earned = v_total_earned,
      total_redeemed = v_total_redeemed,
      updated_at = now()
  where id = v_deleted.loyalty_card_id
  returning * into v_card;

  return jsonb_build_object(
    'deletedTransactionId', p_transaction_id,
    'card', to_jsonb(v_card)
  );
end;
$$;

revoke all on function public.delete_loyalty_transaction(uuid) from public;
grant execute on function public.delete_loyalty_transaction(uuid) to authenticated;
grant execute on function public.delete_loyalty_transaction(uuid) to service_role;
