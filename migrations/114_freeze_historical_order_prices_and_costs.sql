-- Freeze every sold item's real cost permanently. Menu selling-price, old-price,
-- parent-cost, and variant-cost edits must affect only order items inserted after
-- the edit; historical Accounting and profit never read today's menu values.

begin;

do $$
declare
  paid_order_items_guard_state text := null;
begin
  select trigger.tgenabled::text
  into paid_order_items_guard_state
  from pg_trigger as trigger
  where trigger.tgrelid = 'public.order_items'::regclass
    and trigger.tgname = 'guard_paid_order_items'
    and not trigger.tgisinternal
  limit 1;

  if paid_order_items_guard_state in ('O', 'R', 'A') then
    execute 'alter table public.order_items disable trigger guard_paid_order_items';
  end if;

  update public.order_items as sold_item
  set cost_price = coalesce(
    (
      select coalesce(
        (
          select greatest(0, (item_cost.variant_costs ->> selection.value)::integer)
          from jsonb_each_text(coalesce(sold_item.selected_options, '{}'::jsonb)) as selection(key, value)
          where item_cost.variant_costs ? selection.value
            and (item_cost.variant_costs ->> selection.value) ~ '^[0-9]+$'
          order by selection.key
          limit 1
        ),
        item_cost.cost_price
      )
      from public.menu_item_costs as item_cost
      where item_cost.menu_item_id = sold_item.menu_item_id
    ),
    0
  )
  where sold_item.cost_price is null;

  if paid_order_items_guard_state = 'O' then
    execute 'alter table public.order_items enable trigger guard_paid_order_items';
  elsif paid_order_items_guard_state = 'R' then
    execute 'alter table public.order_items enable replica trigger guard_paid_order_items';
  elsif paid_order_items_guard_state = 'A' then
    execute 'alter table public.order_items enable always trigger guard_paid_order_items';
  end if;
exception
  when others then
    if paid_order_items_guard_state = 'O' then
      execute 'alter table public.order_items enable trigger guard_paid_order_items';
    elsif paid_order_items_guard_state = 'R' then
      execute 'alter table public.order_items enable replica trigger guard_paid_order_items';
    elsif paid_order_items_guard_state = 'A' then
      execute 'alter table public.order_items enable always trigger guard_paid_order_items';
    end if;
    raise;
end $$;

create or replace function public.snapshot_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never trust a client-supplied cost. Capture the protected value that is
  -- active when this order item is created and never recalculate it later.
  new.cost_price := coalesce(
    (
      select coalesce(
        (
          select greatest(0, (item_cost.variant_costs ->> selection.value)::integer)
          from jsonb_each_text(coalesce(new.selected_options, '{}'::jsonb)) as selection(key, value)
          where item_cost.variant_costs ? selection.value
            and (item_cost.variant_costs ->> selection.value) ~ '^[0-9]+$'
          order by selection.key
          limit 1
        ),
        item_cost.cost_price
      )
      from public.menu_item_costs as item_cost
      where item_cost.menu_item_id = new.menu_item_id
    ),
    0
  );
  return new;
end;
$$;

alter table public.order_items
  alter column cost_price set default 0;

alter table public.order_items
  alter column cost_price set not null;

create or replace function public.get_accounting_paid_order_summary(
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  from_instant timestamptz;
  to_instant_exclusive timestamptz;
  result jsonb;
begin
  if not public.current_staff_can_access('expenses') then
    raise exception 'Accounting access is required' using errcode = '42501';
  end if;

  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'A valid Accounting date range is required';
  end if;

  from_instant := p_date_from::timestamp at time zone 'Asia/Tashkent';
  to_instant_exclusive := (p_date_to + 1)::timestamp at time zone 'Asia/Tashkent';

  with paid_orders as materialized (
    select
      orders.id,
      greatest(0, round(coalesce(orders.total, 0)::numeric)) as cafe_income,
      greatest(
        0,
        round(coalesce(orders.loyalty_used_amount, orders.loyalty_redeem_amount, 0)::numeric)
      ) as loyalty_income,
      orders.payment_method,
      coalesce(orders.paid_at, orders.created_at) as accounting_at
    from public.orders
    where orders.status::text is distinct from 'cancelled'
      and orders.payment_status::text is distinct from 'cancelled'
      and (
        (
          orders.paid_at is not null
          and orders.paid_at >= from_instant
          and orders.paid_at < to_instant_exclusive
        )
        or (
          orders.paid_at is null
          and (
            orders.payment_status::text = 'paid'
            or orders.status::text in ('paid', 'completed')
          )
          and orders.created_at >= from_instant
          and orders.created_at < to_instant_exclusive
        )
      )
  ),
  order_item_costs as (
    select
      sold_item.order_id,
      round(sum(
        greatest(0, coalesce(sold_item.quantity, 1)::numeric)
        * greatest(0, sold_item.cost_price::numeric)
      )) as cost_total
    from public.order_items as sold_item
    join paid_orders
      on paid_orders.id = sold_item.order_id
    where lower(coalesce(sold_item.status::text, '')) <> 'cancelled'
    group by sold_item.order_id
  ),
  explicit_payment_orders as (
    select distinct payment.order_id
    from public.order_payments as payment
    join paid_orders
      on paid_orders.id = payment.order_id
  ),
  normalized_payments as (
    select
      payment.order_id,
      case
        when lower(btrim(payment.method::text)) in ('qr_code', 'qr-code', 'qrcode') then 'qr'
        when lower(btrim(payment.method::text)) in ('loyalty', 'loyalty-card', 'loyalty_card') then 'loyalty_card'
        else lower(btrim(payment.method::text))
      end as method,
      greatest(0, round(coalesce(payment.amount, 0)::numeric)) as amount
    from public.order_payments as payment
    join paid_orders
      on paid_orders.id = payment.order_id
    where round(coalesce(payment.amount, 0)::numeric) > 0

    union all

    select
      paid_orders.id,
      case
        when lower(btrim(coalesce(paid_orders.payment_method::text, ''))) in ('qr_code', 'qr-code', 'qrcode') then 'qr'
        when lower(btrim(coalesce(paid_orders.payment_method::text, ''))) in ('loyalty', 'loyalty-card', 'loyalty_card') then 'loyalty_card'
        else lower(btrim(coalesce(paid_orders.payment_method::text, '')))
      end as method,
      paid_orders.cafe_income as amount
    from paid_orders
    where paid_orders.cafe_income > 0
      and not exists (
        select 1
        from explicit_payment_orders
        where explicit_payment_orders.order_id = paid_orders.id
      )
  ),
  loyalty_payments as (
    select
      paid_orders.id as order_id,
      'loyalty_card'::text as method,
      paid_orders.loyalty_income as amount
    from paid_orders
    where paid_orders.loyalty_income > 0
      and not exists (
        select 1
        from normalized_payments
        where normalized_payments.order_id = paid_orders.id
          and normalized_payments.method = 'loyalty_card'
      )
  ),
  payment_totals as (
    select method, sum(amount) as amount
    from (
      select method, amount from normalized_payments
      union all
      select method, amount from loyalty_payments
    ) as all_payments
    where method in ('cash', 'card', 'terminal', 'qr', 'loyalty_card')
    group by method
  )
  select jsonb_build_object(
    'cafe_income', coalesce((select sum(cafe_income) from paid_orders), 0),
    'loyalty_income', coalesce((select sum(loyalty_income) from paid_orders), 0),
    'cost_total', coalesce((select sum(cost_total) from order_item_costs), 0),
    'order_count', (select count(*) from paid_orders),
    'sales_day_count', (
      select count(distinct (accounting_at at time zone 'Asia/Tashkent')::date)
      from paid_orders
    ),
    'payment_method_income', jsonb_build_object(
      'cash', coalesce((select amount from payment_totals where method = 'cash'), 0),
      'card', coalesce((select amount from payment_totals where method = 'card'), 0),
      'terminal', coalesce((select amount from payment_totals where method = 'terminal'), 0),
      'qr', coalesce((select amount from payment_totals where method = 'qr'), 0),
      'loyalty_card', coalesce((select amount from payment_totals where method = 'loyalty_card'), 0)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_accounting_paid_order_summary(date, date)
  from public, anon, authenticated;
grant execute on function public.get_accounting_paid_order_summary(date, date)
  to authenticated;

commit;

notify pgrst, 'reload schema';
