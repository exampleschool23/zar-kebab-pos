-- Lightweight paid-order totals for Accounting.
-- The Accounting overview needs aggregate revenue, loyalty, product cost, and
-- payment-method balances; it does not need complete orders or order items.

begin;

create index if not exists idx_orders_paid_at
  on public.orders (paid_at)
  where paid_at is not null;

create index if not exists idx_orders_legacy_paid_created_at
  on public.orders (created_at)
  where paid_at is null
    and (
      payment_status = 'paid'
      or status in ('paid', 'completed')
    );

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
        * coalesce(
          sold_item.cost_price::numeric,
          variant_cost.cost_price,
          current_cost.cost_price::numeric,
          0
        )
      )) as cost_total
    from public.order_items as sold_item
    join paid_orders
      on paid_orders.id = sold_item.order_id
    left join public.menu_item_costs as current_cost
      on current_cost.menu_item_id = sold_item.menu_item_id
    left join lateral (
      select greatest(
        0,
        (current_cost.variant_costs ->> selection.value)::numeric
      ) as cost_price
      from jsonb_each_text(coalesce(sold_item.selected_options, '{}'::jsonb)) as selection(key, value)
      where current_cost.variant_costs ? selection.value
        and (current_cost.variant_costs ->> selection.value) ~ '^[0-9]+$'
      order by selection.key
      limit 1
    ) as variant_cost on true
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
      select method, amount
      from normalized_payments
      union all
      select method, amount
      from loyalty_payments
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
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_accounting_paid_order_summary(date, date)
  from public, anon, authenticated;
grant execute on function public.get_accounting_paid_order_summary(date, date)
  to authenticated;

notify pgrst, 'reload schema';

commit;
