-- Cleanup old/test operational data.
--
-- Intended for one-off production cleanup after test activity.
-- Default cutoff is the start of June 13, 2026 in Asia/Tashkent
-- (2026-06-12 19:00:00 UTC), which removes operations through June 12.

create or replace function public.cleanup_test_operations(
  p_cutoff timestamptz default '2026-06-12 19:00:00+00',
  p_test_emails text[] default array[
    'kanochiy6611@gmail.com',
    'sherzodovna.0208@gmail.com',
    'ddk9499@gmail.com',
    'yogam1.ddk@gmail.com',
    'javoxirbekshomurodov@gmail.com',
    'ustozkamolovad@gmail.com',
    'shomurodovamaftuna2007@gmail.com',
    'jasurbek@snoonu.com',
    'ustozkamolova@gmail.com',
    'dildoravlogs@gmail.com',
    'dildoramuqumova12@gmail.com'
  ],
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_ids uuid[] := array[]::uuid[];
  v_profile_names text[] := array[]::text[];
  v_fallback_names text[] := array[
    'Izzatilla Ismatov',
    'Mehrinoz Amondullayeva',
    'Dostonbek K',
    'Dostonbek Kamalov',
    'Javoxirbek Shomurodov',
    'Дилрабо Камолова',
    'Maftuna Shomurodova',
    'Jasurbek Shomurodov',
    'Диля Камолова',
    'Dildora Vlogs',
    'Dildora Muqumova'
  ];
  v_test_names text[] := array[]::text[];
  v_order_ids text[] := array[]::text[];
  v_table_ids text[] := array[]::text[];
  v_trigger_exists boolean := false;
  v_counts jsonb;
  v_deleted_orders integer := 0;
  v_deleted_cancellations integer := 0;
  v_deleted_profile_audit integer := 0;
  v_reset_tables integer := 0;
begin
  select
    coalesce(array_agg(id), array[]::uuid[]),
    coalesce(array_agg(nullif(full_name, '')), array[]::text[])
  into v_profile_ids, v_profile_names
  from public.profiles
  where lower(email) = any(select lower(unnest(p_test_emails)));

  select coalesce(array_agg(distinct name), array[]::text[])
  into v_test_names
  from unnest(v_profile_names || v_fallback_names) as name
  where nullif(name, '') is not null;

  select coalesce(array_agg(id), array[]::text[])
  into v_order_ids
  from public.orders
  where created_at < p_cutoff
     or waiter_name = any(v_test_names);

  select coalesce(array_agg(distinct table_id), array[]::text[])
  into v_table_ids
  from public.orders
  where id = any(v_order_ids)
    and table_id is not null;

  v_counts := jsonb_build_object(
    'apply', p_apply,
    'cutoffUtc', p_cutoff,
    'cutoffMeaning', 'delete operations created before this timestamp; default equals 2026-06-13 00:00 Asia/Tashkent',
    'matchedProfiles', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'email', email,
        'full_name', full_name,
        'role', role,
        'status', status
      ) order by full_name), '[]'::jsonb)
      from public.profiles
      where id = any(v_profile_ids)
    ),
    'matchedWaiterNames', to_jsonb(v_test_names),
    'ordersToDelete', coalesce(array_length(v_order_ids, 1), 0),
    'orderItemsToDelete', (
      select count(*)
      from public.order_items
      where order_id = any(v_order_ids)
    ),
    'orderPaymentsToDelete', (
      select count(*)
      from public.order_payments
      where order_id = any(v_order_ids)
    ),
    'orderPaymentAuditToDelete', (
      select count(*)
      from public.order_payment_audit
      where order_id = any(v_order_ids)
    ),
    'orderItemCancellationsToDelete', (
      select count(*)
      from public.order_item_cancellations
      where created_at < p_cutoff
         or order_id = any(v_order_ids)
         or created_by = any(v_profile_ids)
    ),
    'profileAuditToDelete', (
      select count(*)
      from public.profile_audit
      where changed_at < p_cutoff
         or profile_id = any(v_profile_ids)
         or actor_id = any(v_profile_ids)
    ),
    'loyaltyTransactionsPreserved', (
      select count(*)
      from public.loyalty_transactions
      where created_at < p_cutoff
         or order_id = any(v_order_ids)
         or created_by = any(v_profile_ids)
    ),
    'tablesToRecheckAfterDelete', coalesce(array_length(v_table_ids, 1), 0),
    'sampleOrders', (
      select coalesce(jsonb_agg(row_to_json(sample_rows)), '[]'::jsonb)
      from (
        select id, created_at, waiter_name, table_name, status, payment_status, total
        from public.orders
        where id = any(v_order_ids)
        order by created_at desc
        limit 20
      ) sample_rows
    )
  );

  if not p_apply then
    return v_counts;
  end if;

  delete from public.order_item_cancellations
  where created_at < p_cutoff
     or order_id = any(v_order_ids)
     or created_by = any(v_profile_ids);
  get diagnostics v_deleted_cancellations = row_count;

  delete from public.profile_audit
  where changed_at < p_cutoff
     or profile_id = any(v_profile_ids)
     or actor_id = any(v_profile_ids);
  get diagnostics v_deleted_profile_audit = row_count;

  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.order_items'::regclass
      and tgname = 'guard_paid_order_items'
      and not tgisinternal
  ) into v_trigger_exists;

  if v_trigger_exists then
    execute 'alter table public.order_items disable trigger guard_paid_order_items';
  end if;

  delete from public.orders
  where id = any(v_order_ids);
  get diagnostics v_deleted_orders = row_count;

  if v_trigger_exists then
    execute 'alter table public.order_items enable trigger guard_paid_order_items';
  end if;

  update public.restaurant_tables rt
  set
    status = 'available',
    reserved_for_name = null,
    reserved_for_phone = null,
    reserved_at = null,
    reserved_until = null,
    reservation_notes = null,
    updated_at = now()
  where rt.id = any(v_table_ids)
    and rt.status in ('occupied', 'needs_bill', 'reserved')
    and not exists (
      select 1
      from public.orders o
      where o.table_id = rt.id
        and coalesce(o.payment_status, 'unpaid') <> 'paid'
        and o.status not in ('paid', 'completed', 'cancelled')
    );
  get diagnostics v_reset_tables = row_count;

  return v_counts || jsonb_build_object(
    'deletedOrders', v_deleted_orders,
    'deletedOrderItemCancellations', v_deleted_cancellations,
    'deletedProfileAudit', v_deleted_profile_audit,
    'resetTables', v_reset_tables,
    'note', 'Loyalty transactions were preserved to avoid corrupting wallet balances.'
  );
exception
  when others then
    if v_trigger_exists then
      execute 'alter table public.order_items enable trigger guard_paid_order_items';
    end if;
    raise;
end;
$$;

revoke all on function public.cleanup_test_operations(timestamptz, text[], boolean) from public;
grant execute on function public.cleanup_test_operations(timestamptz, text[], boolean) to service_role;
