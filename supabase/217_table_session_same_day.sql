-- A table session lasts one Tashkent day. 215 let a forgotten order from an
-- earlier day pass its old opener to a new party; inheritance now only comes
-- from active orders created on the same Tashkent date as the new order.
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
        -- A leftover order from an earlier day is not part of today's table
        -- session; it must never pass its old opener to a new party.
        and (active_order.created_at at time zone 'Asia/Tashkent')::date
          = (coalesce(new.created_at, now()) at time zone 'Asia/Tashkent')::date
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

notify pgrst, 'reload schema';
commit;
