-- Reject a kitchen round whose Regular/Tourist mode conflicts with a live bill
-- on the same table. A stale client must not open a second bill in the other
-- mode, add Regular-priced rows to a Tourist bill, or flip a locked bill's mode.
begin;

create or replace function public.submit_order_to_kitchen(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
set lock_timeout = '8s'
as $$
declare
  target_order_type text := coalesce(
    nullif(payload #>> '{order,order_type}', ''),
    'dine_in'
  );
  target_order_id text := nullif(payload #>> '{order,id}', '');
  target_table_id text := nullif(payload #>> '{order,table_id}', '');
  target_price_mode text := coalesce(nullif(payload #>> '{order,price_mode}', ''), 'regular');
  target_kitchen_round_id text := coalesce(
    nullif(payload ->> 'kitchen_round_id', ''),
    nullif(payload #>> '{items,0,kitchen_round_id}', '')
  );
begin
  if (
    target_order_type in ('take_away', 'delivery', 'game_club')
    or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(payload -> 'items') = 'array' then payload -> 'items'
          else '[]'::jsonb
        end
      ) as submitted_item
      where submitted_item ->> 'order_type' in ('take_away', 'delivery', 'game_club')
    )
  )
    and public.current_staff_can_write('off_premise_orders') is not true then
    raise exception 'Take Away and Delivery order access is required'
      using errcode = '42501';
  end if;

  if target_order_type = 'dine_in' and target_table_id is not null and target_order_id is not null then
    if target_price_mode not in ('regular', 'tourist') then
      target_price_mode := 'regular';
    end if;
    -- Same lock the worker takes (re-entrant), so the check and insert are atomic
    -- with checkout, bill edits and other submissions for this table.
    perform pg_advisory_xact_lock(hashtextextended('pos-table:' || target_table_id, 0));

    -- Retries of an already committed round are reconciled by the worker.
    if not exists (
      select 1 from public.order_kitchen_rounds r
      where r.order_id = target_order_id and r.kitchen_round_id = target_kitchen_round_id
    ) and not exists (
      select 1 from public.order_items i
      where i.order_id = target_order_id and i.kitchen_round_id = target_kitchen_round_id
    ) then
      if exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(payload -> 'items') = 'array' then payload -> 'items' else '[]'::jsonb end
        ) as submitted_item
        where coalesce(nullif(submitted_item ->> 'price_mode', ''), target_price_mode) <> target_price_mode
      ) or exists (
        select 1
        from public.orders o
        where o.table_id = target_table_id
          and coalesce(o.payment_status, '') not in ('paid', 'cancelled')
          and o.paid_at is null
          and coalesce(o.status, '') not in ('paid', 'completed', 'cancelled')
          and coalesce(nullif(o.price_mode, ''), 'regular') <> target_price_mode
          and exists (
            select 1 from public.order_items i
            where i.order_id = o.id and coalesce(i.status, '') <> 'cancelled'
          )
      ) then
        raise exception 'Table price mode conflict: this table already has an open bill in another price mode'
          using errcode = '23514';
      end if;
    end if;
  end if;

  perform public.submit_order_to_kitchen_unchecked(payload);
end;
$$;

revoke all on function public.submit_order_to_kitchen(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_order_to_kitchen(jsonb)
  to authenticated, service_role;

comment on function public.submit_order_to_kitchen(jsonb) is
  'Permission-checked kitchen submission entry point; rejects rounds that conflict with an open bill''s Regular/Tourist mode.';

notify pgrst, 'reload schema';
commit;
