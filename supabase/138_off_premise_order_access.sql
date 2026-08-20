-- Give Take Away and Delivery order creation its own per-user feature access.
-- Tables access remains required for the waiter workspace, while this narrower
-- action decides whether an editor may start and submit off-premise orders.

begin;

alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or (
      feature_access <@ array[
        'dashboard', 'tables', 'menu', 'cashier', 'loyalty', 'expenses',
        'bazaar', 'team', 'reports', 'audit', 'settings',
        'off_premise_orders', 'delete_paid_orders'
      ]::text[]
      and (
        not ('off_premise_orders' = any(feature_access))
        or 'tables' = any(feature_access)
      )
      and (
        not ('delete_paid_orders' = any(feature_access))
        or feature_access && array['dashboard', 'cashier', 'reports']::text[]
      )
    )
  );

-- Preserve the current, receipt-aware implementation as the internal worker.
-- The public function below becomes the permission-checking boundary without
-- duplicating the kitchen submission and retry reconciliation logic.
do $$
begin
  if to_regprocedure('public.submit_order_to_kitchen_unchecked(jsonb)') is null then
    if to_regprocedure('public.submit_order_to_kitchen(jsonb)') is null then
      raise exception 'submit_order_to_kitchen(jsonb) is missing; apply migration 128 first';
    end if;
    alter function public.submit_order_to_kitchen(jsonb)
      rename to submit_order_to_kitchen_unchecked;
  end if;
end $$;

revoke all on function public.submit_order_to_kitchen_unchecked(jsonb)
  from public, anon, authenticated;

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
begin
  if (
    target_order_type in ('take_away', 'delivery')
    or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(payload -> 'items') = 'array' then payload -> 'items'
          else '[]'::jsonb
        end
      ) as submitted_item
      where submitted_item ->> 'order_type' in ('take_away', 'delivery')
    )
  )
    and public.current_staff_can_write('off_premise_orders') is not true then
    raise exception 'Take Away and Delivery order access is required'
      using errcode = '42501';
  end if;

  perform public.submit_order_to_kitchen_unchecked(payload);
end;
$$;

revoke all on function public.submit_order_to_kitchen(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_order_to_kitchen(jsonb)
  to authenticated, service_role;

comment on function public.submit_order_to_kitchen(jsonb) is
  'Permission-checked kitchen submission entry point, including explicit off-premise order access.';
comment on function public.submit_order_to_kitchen_unchecked(jsonb) is
  'Internal receipt-aware kitchen submission worker; call through submit_order_to_kitchen(jsonb).';

commit;
