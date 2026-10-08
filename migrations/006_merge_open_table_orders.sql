-- ============================================================
-- Zar Kebab POS — Merge duplicate open orders per table
-- Use once if a table already has several unpaid order rows for one visit.
-- Paid history is left unchanged; reports group that safely.
-- ============================================================

with duplicate_tables as (
  select
    table_id,
    (array_agg(id order by created_at asc))[1] as keep_id,
    (array_agg(id order by created_at asc))[2:] as remove_ids,
    bool_or(status in ('sent_to_kitchen', 'preparing')) as has_kitchen_work,
    bool_or(status = 'needs_bill') as has_needs_bill
  from public.orders
  where payment_status <> 'paid'
    and status <> 'cancelled'
    and table_id is not null
  group by table_id
  having count(*) > 1
),
moved_items as (
  update public.order_items oi
  set order_id = d.keep_id
  from duplicate_tables d
  where oi.order_id = any(d.remove_ids)
  returning d.keep_id
),
recalculated as (
  select
    d.keep_id,
    coalesce(sum(oi.price * oi.quantity), 0)::integer as subtotal,
    coalesce((
      select sum(o.service_fee)
      from public.orders o
      where o.id = d.keep_id or o.id = any(d.remove_ids)
    ), 0)::integer as service_fee,
    case
      when d.has_kitchen_work then 'sent_to_kitchen'
      when d.has_needs_bill then 'needs_bill'
      else 'delivered'
    end as next_status
  from duplicate_tables d
  left join public.order_items oi on oi.order_id = d.keep_id
  group by d.keep_id, d.remove_ids, d.has_kitchen_work, d.has_needs_bill
),
updated_orders as (
  update public.orders o
  set
    status = r.next_status,
    subtotal = r.subtotal,
    service_fee = r.service_fee,
    total = r.subtotal + r.service_fee,
    updated_at = now()
  from recalculated r
  where o.id = r.keep_id
  returning o.id
)
delete from public.orders o
using duplicate_tables d
where o.id = any(d.remove_ids);
