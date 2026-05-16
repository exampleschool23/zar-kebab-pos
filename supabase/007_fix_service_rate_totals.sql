-- ============================================================
-- Zar Kebab POS — Fix historical service fees to 20%
-- Use if old grouped bills show impossible service rates such as 42%.
-- ============================================================

alter table public.orders
  add column if not exists service_rate_pct integer not null default 20;

with calculated as (
  select
    o.id,
    coalesce(nullif(o.subtotal, 0), sum(oi.price * oi.quantity), 0)::integer as subtotal,
    coalesce(o.loyalty_discount_amount, 0)::integer as discount_amount
  from public.orders o
  left join public.order_items oi on oi.order_id = o.id
  group by o.id
)
update public.orders o
set
  service_rate_pct = 20,
  subtotal = c.subtotal,
  discounted_subtotal = greatest(c.subtotal - c.discount_amount, 0),
  service_fee = round(greatest(c.subtotal - c.discount_amount, 0) * 0.20)::integer,
  total = greatest(c.subtotal - c.discount_amount, 0)
        + round(greatest(c.subtotal - c.discount_amount, 0) * 0.20)::integer,
  updated_at = now()
from calculated c
where o.id = c.id;
