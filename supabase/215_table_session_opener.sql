-- Only the waiter who opened a table is credited for that table session.
-- A second device that has not loaded the table's active order yet creates a
-- separate order row; without this, that row carried the second waiter as its
-- opener, splitting KPI and showing two waiters on the paid-order message.
-- New dine-in order rows now inherit the opener of the table's earliest active
-- order. Kitchen-round receipts keep the account that actually sent the round.
-- Existing orders, finalized KPI results and sent notices are unchanged.
begin;

create or replace function public.set_order_actor_tracking_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile_id uuid;
  actor_name text;
  session_opener record;
  old_paid boolean := false;
  new_paid boolean := false;
begin
  if actor_id is not null then
    select id, coalesce(nullif(full_name, ''), email, actor_id::text)
      into actor_profile_id, actor_name
    from public.profiles
    where id = actor_id;
  end if;

  if tg_op = 'INSERT' then
    if actor_id is not null then
      new.opened_by := actor_profile_id;
    end if;

    new.opened_by_name := coalesce(
      actor_name,
      nullif(new.opened_by_name, ''),
      nullif(new.waiter_name, ''),
      'Waiter'
    );

    -- Empty shells and all-cancelled orders do not hold a table session.
    if new.table_id is not null
       and coalesce(new.order_type, 'dine_in') = 'dine_in' then
      select active_order.opened_by, active_order.opened_by_name, active_order.waiter_name
        into session_opener
      from public.orders active_order
      where active_order.table_id = new.table_id
        and active_order.id <> new.id
        and coalesce(active_order.order_type, 'dine_in') = 'dine_in'
        and coalesce(active_order.payment_status, 'unpaid') not in ('paid', 'cancelled')
        and coalesce(active_order.status, 'sent_to_kitchen') not in ('paid', 'completed', 'cancelled')
        and active_order.paid_at is null
        and exists (
          select 1
          from public.order_items active_item
          where active_item.order_id = active_order.id
            and lower(coalesce(active_item.status, '')) <> 'cancelled'
        )
      order by active_order.created_at, active_order.id
      limit 1;

      if found then
        new.opened_by := session_opener.opened_by;
        new.opened_by_name := coalesce(
          nullif(session_opener.opened_by_name, ''),
          nullif(session_opener.waiter_name, ''),
          new.opened_by_name
        );
        new.waiter_name := coalesce(
          nullif(session_opener.waiter_name, ''),
          nullif(session_opener.opened_by_name, ''),
          new.waiter_name
        );
      end if;
    end if;

    return new;
  end if;

  old_paid := old.payment_status = 'paid' or old.status in ('paid', 'completed') or old.paid_at is not null;
  new_paid := new.payment_status = 'paid' or new.status in ('paid', 'completed') or new.paid_at is not null;

  if not old_paid and new_paid then
    if actor_id is not null then
      new.completed_by := actor_profile_id;
    end if;

    new.completed_by_name := coalesce(
      actor_name,
      nullif(new.completed_by_name, ''),
      'Cashier'
    );
  end if;

  return new;
end;
$$;

create or replace function public.record_order_kitchen_round_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
set lock_timeout = '8s'
as $$
declare
  source_order_id text;
  source_kitchen_round_id text;
  source_item_id uuid;
  source_item_submitted_at timestamptz;
  source_table_id text;
  source_submitted_by uuid;
begin
  if tg_op = 'DELETE' then
    source_order_id := old.order_id;
    source_kitchen_round_id := old.kitchen_round_id;
    source_item_id := old.id;
    source_item_submitted_at := coalesce(old.submitted_at, old.created_at, now());
  else
    source_order_id := new.order_id;
    source_kitchen_round_id := new.kitchen_round_id;
    source_item_id := new.id;
    source_item_submitted_at := coalesce(new.submitted_at, new.created_at, now());
  end if;

  if nullif(btrim(source_kitchen_round_id), '') is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select source_order.table_id, source_order.opened_by
  into source_table_id, source_submitted_by
  from public.orders as source_order
  where source_order.id = source_order_id;

  -- The order opener may be inherited from the table session, so a new round
  -- records its signed-in sender. Deletions keep the saved opener fallback.
  if tg_op = 'INSERT' then
    source_submitted_by := coalesce(auth.uid(), source_submitted_by);
  end if;

  insert into public.order_kitchen_rounds (
    order_id,
    kitchen_round_id,
    item_ids,
    table_id,
    submitted_by,
    submitted_at
  ) values (
    source_order_id,
    source_kitchen_round_id,
    array[source_item_id],
    source_table_id,
    source_submitted_by,
    source_item_submitted_at
  )
  on conflict (order_id, kitchen_round_id) do update
  set
    item_ids = (
      select array_agg(distinct receipt_item_id order by receipt_item_id)
      from unnest(public.order_kitchen_rounds.item_ids || excluded.item_ids) as receipt_item_id
    ),
    table_id = coalesce(public.order_kitchen_rounds.table_id, excluded.table_id),
    submitted_by = coalesce(public.order_kitchen_rounds.submitted_by, excluded.submitted_by),
    submitted_at = least(public.order_kitchen_rounds.submitted_at, excluded.submitted_at);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.record_order_kitchen_round_receipt()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
