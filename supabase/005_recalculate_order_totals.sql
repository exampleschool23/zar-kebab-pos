-- ============================================================
-- Zar Kebab POS — Recalculate stored order totals
-- Use this once if historical rows were saved with duplicated session totals.
-- ============================================================

with item_totals as (
  select
    order_id,
    coalesce(sum(price * quantity), 0)::integer as item_subtotal
  from public.order_items
  group by order_id
),
calculated as (
  select
    o.id,
    coalesce(nullif(o.subtotal, 0), it.item_subtotal, 0)::integer as subtotal,
    coalesce(o.service_fee, 0)::integer as service_fee,
    coalesce(o.loyalty_discount_amount, 0)::integer as discount_amount
  from public.orders o
  left join item_totals it on it.order_id = o.id
)
update public.orders o
set
  subtotal = c.subtotal,
  discounted_subtotal = greatest(c.subtotal - c.discount_amount, 0),
  total = greatest(c.subtotal - c.discount_amount, 0) + c.service_fee,
  updated_at = now()
from calculated c
where o.id = c.id
  and (
    o.subtotal is distinct from c.subtotal
    or o.discounted_subtotal is distinct from greatest(c.subtotal - c.discount_amount, 0)
    or o.total is distinct from greatest(c.subtotal - c.discount_amount, 0) + c.service_fee
  );
