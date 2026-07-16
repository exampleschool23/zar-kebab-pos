-- Daily Bazaar item ledger with one linked Accounting expense per purchase.
--
-- Run migrations in numeric order. This migration intentionally does not
-- rebuild profiles, role enums, or the Accounting schema. It verifies the
-- Accounting contract it needs and fails with a concise prerequisite message.

begin;

-- Add only the feature-access field owned by this feature. The remaining
-- profile contract comes from the earlier profile/team migrations.
alter table public.profiles
  add column if not exists feature_access text[];

-- Normalize old logical feature keys before installing the current constraint.
alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

-- A selectively upgraded database may have a stale protection trigger whose
-- helper no longer exists. Disable only that trigger for these trusted updates;
-- it is re-enabled below before application traffic can resume.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'prevent_non_owner_feature_access_update'
      and not tgisinternal
  ) then
    alter table public.profiles disable trigger prevent_non_owner_feature_access_update;
  end if;
end $$;

update public.profiles
set feature_access = array_append(feature_access, 'menu')
where feature_access is not null
  and 'edit_menu_items' = any(feature_access)
  and not ('menu' = any(feature_access));

update public.profiles
set feature_access = array_remove(
  array_remove(feature_access, 'edit_menu_items'),
  'move_back_to_table'
)
where feature_access is not null;

update public.profiles as profile
set feature_access = (
  select coalesce(array_agg(clean.feature_key order by clean.first_ordinality), array[]::text[])
  from (
    select entry.feature_key, min(entry.ordinality) as first_ordinality
    from unnest(profile.feature_access) with ordinality as entry(feature_key, ordinality)
    where entry.feature_key = any(array[
      'dashboard', 'tables', 'menu', 'cashier', 'loyalty', 'expenses',
      'bazaar', 'team', 'reports', 'audit', 'settings', 'delete_paid_orders'
    ]::text[])
    group by entry.feature_key
  ) as clean
)
where profile.feature_access is not null;

update public.profiles
set feature_access = array_remove(feature_access, 'delete_paid_orders')
where feature_access is not null
  and 'delete_paid_orders' = any(feature_access)
  and not (feature_access && array['dashboard', 'cashier', 'reports']::text[]);

-- Existing Accounting users also receive the new, narrower Bazaar page.
update public.profiles
set feature_access = array_append(feature_access, 'bazaar')
where feature_access is not null
  and 'expenses' = any(feature_access)
  and not ('bazaar' = any(feature_access));

do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'prevent_non_owner_feature_access_update'
      and not tgisinternal
  ) then
    alter table public.profiles enable trigger prevent_non_owner_feature_access_update;
  end if;
end $$;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or (
      feature_access <@ array[
        'dashboard', 'tables', 'menu', 'cashier', 'loyalty', 'expenses',
        'bazaar', 'team', 'reports', 'audit', 'settings', 'delete_paid_orders'
      ]::text[]
      and (
        not ('delete_paid_orders' = any(feature_access))
        or feature_access && array['dashboard', 'cashier', 'reports']::text[]
      )
    )
  );

-- Cast enum-backed role/status values to text only for comparison. No enum
-- label such as `guest` is assumed or assigned by this migration.
create or replace function public.current_staff_can_access(feature_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select case
      when profile.status::text <> 'active' then false
      when profile.role::text = 'owner'
        and lower(coalesce(profile.email, '')) = 'dangerhoggish@gmail.com' then true
      when feature_key = 'delete_paid_orders'
        and profile.role::text not in ('owner', 'admin') then false
      when profile.feature_access is not null then feature_key = any(profile.feature_access)
      when profile.role::text = 'owner' then true
      else false
    end
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false);
$$;

create or replace function public.current_staff_can_write(feature_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select profile.status::text = 'active'
      and profile.role::text in ('owner', 'admin')
      and public.current_staff_can_access(feature_key)
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false);
$$;

revoke all on function public.current_staff_can_access(text) from public, anon;
revoke all on function public.current_staff_can_write(text) from public, anon;
grant execute on function public.current_staff_can_access(text) to authenticated;
grant execute on function public.current_staff_can_write(text) to authenticated;

-- Daily Bazaar depends on the canonical Accounting contract from migrations
-- 048, 059, and 085. Report missing prerequisites without mutating that table.
do $$
declare
  required_column text;
begin
  if to_regclass('public.expenses') is null then
    raise exception 'Daily Bazaar prerequisite missing: run Accounting migrations 048, 059, and 085 first';
  end if;

  foreach required_column in array array[
    'id', 'entry_type', 'expense_date', 'category', 'payment_method', 'amount',
    'vendor', 'description', 'created_by', 'created_by_name', 'created_at', 'updated_at'
  ]
  loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'expenses'
        and column_name = required_column
    ) then
      raise exception 'Daily Bazaar prerequisite missing: public.expenses.% (run Accounting migrations 048, 059, and 085 first)', required_column;
    end if;
  end loop;
end $$;

-- Remove synchronization machinery from earlier drafts. The application no
-- longer allows Products / Bazaar to be entered manually in Accounting.
drop trigger if exists sync_products_bazaar_expense on public.expenses;
drop trigger if exists guard_structured_bazaar_expense_delete on public.expenses;
drop trigger if exists guard_structured_bazaar_expense_mutation on public.expenses;
drop function if exists public.sync_accounting_expense_to_bazaar();
drop function if exists public.prevent_direct_structured_bazaar_expense_delete();
drop function if exists public.prevent_direct_structured_bazaar_expense_mutation();

create table if not exists public.bazaar_purchases (
  id                uuid primary key default gen_random_uuid(),
  request_key       uuid,
  expense_id        uuid not null unique
                    references public.expenses(id) on delete cascade,
  purchase_date     date not null default current_date,
  payment_method    text not null default 'cash'
                    check (payment_method in ('cash', 'card', 'terminal')),
  buyer_profile_id  uuid references public.profiles(id) on delete set null,
  buyer_name        text not null default '',
  notes             text not null default '',
  total_amount      integer not null check (total_amount > 0),
  entry_source      text not null default 'daily_bazaar'
                    check (entry_source in ('daily_bazaar', 'accounting_backfill')),
  created_by        uuid references public.profiles(id) on delete set null,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Compatibility for an earlier draft that may already have created the table.
alter table public.bazaar_purchases
  add column if not exists request_key uuid,
  add column if not exists buyer_profile_id uuid;

alter table public.bazaar_purchases
  drop column if exists supplier,
  drop column if exists market_name,
  drop column if exists receipt_reference;

alter table public.bazaar_purchases
  drop constraint if exists bazaar_purchases_buyer_profile_id_fkey;

alter table public.bazaar_purchases
  add constraint bazaar_purchases_buyer_profile_id_fkey
  foreign key (buyer_profile_id) references public.profiles(id) on delete set null;

create table if not exists public.bazaar_purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null
                references public.bazaar_purchases(id) on delete cascade,
  product_name  text not null check (btrim(product_name) <> ''),
  product_key   text not null check (btrim(product_key) <> ''),
  category      text not null,
  quantity      numeric(14,3) not null check (quantity > 0),
  unit          text not null,
  line_total    integer not null check (line_total > 0),
  sort_order    integer not null default 0 check (sort_order >= 0),
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bazaar_purchase_items_category_check
    check (category in (
      'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery',
      'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'
    )),
  constraint bazaar_purchase_items_unit_check
    check (unit in (
      'kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'bag', 'bottle', 'bunch'
    )),
  constraint bazaar_purchase_items_whole_count_quantity
    check (
      unit not in ('pcs', 'pack', 'box', 'bag', 'bottle', 'bunch')
      or quantity = trunc(quantity)
    )
);

-- Earlier drafts represented unitemized Accounting history as a fake Other
-- product. Keep the purchase header and remove only that synthetic item.
delete from public.bazaar_purchase_items as item
using public.bazaar_purchases as purchase
where item.purchase_id = purchase.id
  and purchase.entry_source = 'accounting_backfill'
  and item.unit = 'entry';

alter table public.bazaar_purchase_items
  drop constraint if exists bazaar_purchase_items_category_check,
  drop constraint if exists bazaar_purchase_items_unit_check,
  drop constraint if exists bazaar_purchase_items_whole_count_quantity;

alter table public.bazaar_purchase_items
  add constraint bazaar_purchase_items_category_check
    check (category in (
      'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery',
      'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'
    )),
  add constraint bazaar_purchase_items_unit_check
    check (unit in (
      'kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'bag', 'bottle', 'bunch'
    )),
  add constraint bazaar_purchase_items_whole_count_quantity
    check (
      unit not in ('pcs', 'pack', 'box', 'bag', 'bottle', 'bunch')
      or quantity = trunc(quantity)
    );

create table if not exists public.bazaar_product_catalog (
  product_key        text primary key check (btrim(product_key) <> ''),
  product_name       text not null check (btrim(product_name) <> ''),
  category           text not null,
  unit               text not null,
  last_purchase_date date not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint bazaar_product_catalog_category_check
    check (category in (
      'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery',
      'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'
    )),
  constraint bazaar_product_catalog_unit_check
    check (unit in (
      'kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'bag', 'bottle', 'bunch'
    ))
);

delete from public.bazaar_product_catalog
where category = 'other' or unit = 'entry';

alter table public.bazaar_product_catalog
  drop constraint if exists bazaar_product_catalog_category_check,
  drop constraint if exists bazaar_product_catalog_unit_check;

alter table public.bazaar_product_catalog
  add constraint bazaar_product_catalog_category_check
    check (category in (
      'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery',
      'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'
    )),
  add constraint bazaar_product_catalog_unit_check
    check (unit in (
      'kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'bag', 'bottle', 'bunch'
    ));

create table if not exists public.bazaar_purchase_audit (
  id              bigint generated by default as identity primary key,
  purchase_id     uuid not null,
  action          text not null check (action in ('insert', 'update', 'delete')),
  old_snapshot    jsonb,
  new_snapshot    jsonb,
  changed_by      uuid,
  changed_by_name text not null default '',
  changed_at      timestamptz not null default now()
);

alter table public.bazaar_purchase_audit
  drop constraint if exists bazaar_purchase_audit_changed_by_fkey;

create index if not exists idx_bazaar_purchases_date
  on public.bazaar_purchases(purchase_date desc, created_at desc);

create index if not exists idx_bazaar_purchases_buyer_profile
  on public.bazaar_purchases(buyer_profile_id, purchase_date desc);

create index if not exists idx_bazaar_purchases_entry_source
  on public.bazaar_purchases(entry_source, purchase_date desc);

create unique index if not exists idx_bazaar_purchases_request_key
  on public.bazaar_purchases(request_key)
  where request_key is not null;

create index if not exists idx_bazaar_purchase_items_purchase
  on public.bazaar_purchase_items(purchase_id, sort_order, id);

create index if not exists idx_bazaar_purchase_items_product
  on public.bazaar_purchase_items(product_key);

create index if not exists idx_bazaar_purchase_items_category
  on public.bazaar_purchase_items(category);

create index if not exists idx_bazaar_product_catalog_updated_at
  on public.bazaar_product_catalog(updated_at desc);

create index if not exists idx_bazaar_purchase_audit_purchase
  on public.bazaar_purchase_audit(purchase_id, changed_at desc);

create index if not exists idx_bazaar_purchase_audit_changed_at
  on public.bazaar_purchase_audit(changed_at desc);

create or replace function public.normalize_bazaar_product_key(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(
    replace(
      replace(
        replace(
          replace(normalize(btrim(coalesce(value, '')), NFKC), chr(8216), chr(39)),
          chr(8217), chr(39)
        ),
        chr(96), chr(39)
      ),
      chr(180), chr(39)
    ),
    '[[:space:]]+',
    ' ',
    'g'
  ));
$$;

create or replace function public.build_bazaar_purchase_snapshot(p_purchase_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'purchase', to_jsonb(purchase_row),
    'items', coalesce((
      select jsonb_agg(to_jsonb(item_row) order by item_row.sort_order, item_row.created_at, item_row.id)
      from public.bazaar_purchase_items as item_row
      where item_row.purchase_id = purchase_row.id
    ), '[]'::jsonb)
  )
  from public.bazaar_purchases as purchase_row
  where purchase_row.id = p_purchase_id;
$$;

create or replace function public.prevent_bazaar_purchase_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Daily Bazaar audit records are immutable';
end;
$$;

drop trigger if exists bazaar_purchase_audit_is_immutable on public.bazaar_purchase_audit;
create trigger bazaar_purchase_audit_is_immutable
before update or delete on public.bazaar_purchase_audit
for each row execute function public.prevent_bazaar_purchase_audit_mutation();

create or replace function public.capture_bazaar_purchase_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text := '';
begin
  select coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    ''
  )
  into actor_name
  from public.profiles as profile
  where profile.id = auth.uid();

  insert into public.bazaar_purchase_audit (
    purchase_id, action, old_snapshot, new_snapshot, changed_by, changed_by_name
  ) values (
    old.id,
    'delete',
    public.build_bazaar_purchase_snapshot(old.id),
    null,
    auth.uid(),
    coalesce(nullif(actor_name, ''), old.created_by_name, '')
  );

  return old;
end;
$$;

drop trigger if exists audit_bazaar_purchase_delete on public.bazaar_purchases;
create trigger audit_bazaar_purchase_delete
before delete on public.bazaar_purchases
for each row execute function public.capture_bazaar_purchase_delete_audit();

-- Products / Bazaar is owned by the structured Daily Bazaar ledger. Prevent a
-- direct Accounting API mutation from creating an untracked row or changing a
-- linked total behind the ledger's back. The permission-checked RPCs enable a
-- transaction-local flag only after their payload has passed validation.
create or replace function public.prevent_direct_structured_bazaar_expense_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_is_bazaar boolean := false;
  new_is_bazaar boolean := false;
  is_linked boolean := false;
begin
  if current_setting('app.daily_bazaar_rpc', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    old_is_bazaar := old.entry_type::text = 'expense'
      and old.category::text = 'products_bazaar';

    select exists (
      select 1
      from public.bazaar_purchases as purchase
      where purchase.expense_id = old.id
    ) into is_linked;
  end if;

  if tg_op <> 'DELETE' then
    new_is_bazaar := new.entry_type::text = 'expense'
      and new.category::text = 'products_bazaar';
  end if;

  if old_is_bazaar or new_is_bazaar or is_linked then
    raise exception 'Products / Bazaar expenses must be managed from Daily Bazaar'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_structured_bazaar_expense_mutation on public.expenses;
create trigger guard_structured_bazaar_expense_mutation
before insert or update or delete on public.expenses
for each row execute function public.prevent_direct_structured_bazaar_expense_mutation();

-- Preserve historical Accounting Bazaar totals without inventing product data.
-- These header-only rows are read-only in Daily Bazaar.
insert into public.bazaar_purchases (
  expense_id,
  purchase_date,
  payment_method,
  buyer_profile_id,
  buyer_name,
  notes,
  total_amount,
  entry_source,
  created_by,
  created_by_name,
  created_at,
  updated_at
)
select
  expense.id,
  expense.expense_date,
  case
    when expense.payment_method::text in ('cash', 'card', 'terminal') then expense.payment_method::text
    else 'cash'
  end,
  creator.id,
  coalesce(expense.created_by_name, ''),
  coalesce(expense.description, ''),
  expense.amount,
  'accounting_backfill',
  creator.id,
  coalesce(expense.created_by_name, ''),
  expense.created_at,
  expense.updated_at
from public.expenses as expense
left join public.profiles as creator
  on creator.id = expense.created_by
where expense.entry_type::text = 'expense'
  and expense.category::text = 'products_bazaar'
  and expense.amount > 0
  and not exists (
    select 1
    from public.bazaar_purchases as purchase
    where purchase.expense_id = expense.id
  );

-- Rebuild durable product suggestions from structured purchase history.
insert into public.bazaar_product_catalog (
  product_key,
  product_name,
  category,
  unit,
  last_purchase_date,
  created_at,
  updated_at
)
select distinct on (public.normalize_bazaar_product_key(item.product_name))
  public.normalize_bazaar_product_key(item.product_name),
  item.product_name,
  item.category,
  item.unit,
  purchase.purchase_date,
  item.created_at,
  item.updated_at
from public.bazaar_purchase_items as item
join public.bazaar_purchases as purchase
  on purchase.id = item.purchase_id
where purchase.entry_source = 'daily_bazaar'
order by
  public.normalize_bazaar_product_key(item.product_name),
  purchase.purchase_date desc,
  purchase.updated_at desc,
  item.updated_at desc,
  item.id desc
on conflict (product_key) do update
set product_name = excluded.product_name,
    category = excluded.category,
    unit = excluded.unit,
    last_purchase_date = excluded.last_purchase_date,
    updated_at = excluded.updated_at
where excluded.last_purchase_date >= bazaar_product_catalog.last_purchase_date;

insert into public.bazaar_purchase_audit (
  purchase_id, action, old_snapshot, new_snapshot, changed_by, changed_by_name
)
select
  purchase.id,
  'insert',
  null,
  public.build_bazaar_purchase_snapshot(purchase.id),
  purchase.created_by,
  purchase.created_by_name
from public.bazaar_purchases as purchase
where purchase.entry_source = 'accounting_backfill'
  and not exists (
    select 1
    from public.bazaar_purchase_audit as audit
    where audit.purchase_id = purchase.id
      and audit.action = 'insert'
  );

create or replace function public.save_bazaar_purchase(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  purchase_id_value uuid;
  request_key_value uuid;
  expense_id_value uuid;
  existing_purchase public.bazaar_purchases%rowtype;
  purchase_date_value date;
  payment_method_value text;
  buyer_profile_id_value uuid;
  buyer_name_value text := '';
  notes_value text;
  actor_name text := '';
  expense_description text;
  items_value jsonb;
  item_value jsonb;
  item_ordinality integer;
  item_id_value uuid;
  product_name_value text;
  category_value text;
  quantity_value numeric;
  unit_value text;
  line_total_value bigint;
  item_notes_value text;
  total_amount_value bigint := 0;
  old_snapshot_value jsonb;
begin
  if not public.current_staff_can_write('bazaar') then
    raise exception 'Daily Bazaar write access is required';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Daily Bazaar payload must be an object';
  end if;

  if nullif(btrim(payload ->> 'id'), '') is not null then
    purchase_id_value := (payload ->> 'id')::uuid;
  end if;

  if purchase_id_value is null then
    if nullif(btrim(payload ->> 'request_key'), '') is null then
      raise exception 'Daily Bazaar request_key is required for new purchases';
    end if;

    request_key_value := (payload ->> 'request_key')::uuid;
    perform pg_advisory_xact_lock(hashtextextended(request_key_value::text, 0));

    select *
    into existing_purchase
    from public.bazaar_purchases
    where request_key = request_key_value;

    if found then
      return jsonb_build_object(
        'id', existing_purchase.id,
        'request_key', existing_purchase.request_key,
        'expense_id', existing_purchase.expense_id,
        'total_amount', existing_purchase.total_amount,
        'idempotent_replay', true
      );
    end if;
  end if;

  if coalesce(payload ->> 'purchase_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Daily Bazaar purchase_date is required';
  end if;
  purchase_date_value := (payload ->> 'purchase_date')::date;

  payment_method_value := lower(btrim(coalesce(payload ->> 'payment_method', '')));
  if payment_method_value not in ('cash', 'card') then
    raise exception 'Unsupported Daily Bazaar payment method: %', payment_method_value;
  end if;

  if nullif(btrim(payload ->> 'buyer_profile_id'), '') is not null then
    buyer_profile_id_value := (payload ->> 'buyer_profile_id')::uuid;
  end if;
  if buyer_profile_id_value is null then
    raise exception 'Daily Bazaar buyer profile is required';
  end if;

  notes_value := btrim(coalesce(payload ->> 'notes', ''));
  if char_length(notes_value) > 5000 then
    raise exception 'Daily Bazaar notes are too long';
  end if;

  items_value := payload -> 'items';
  if items_value is null or jsonb_typeof(items_value) <> 'array' then
    raise exception 'Daily Bazaar items must be an array';
  end if;
  if jsonb_array_length(items_value) < 1 then
    raise exception 'Daily Bazaar requires at least one item';
  end if;
  if jsonb_array_length(items_value) > 100 then
    raise exception 'Daily Bazaar accepts at most 100 items';
  end if;

  -- Validate all lines and derive the only authoritative total on the server.
  for item_value, item_ordinality in
    select item.value, item.ordinality::integer
    from jsonb_array_elements(items_value) with ordinality as item(value, ordinality)
  loop
    if jsonb_typeof(item_value) <> 'object' then
      raise exception 'Daily Bazaar item % must be an object', item_ordinality;
    end if;

    product_name_value := btrim(coalesce(item_value ->> 'product_name', ''));
    category_value := lower(btrim(coalesce(item_value ->> 'category', '')));
    unit_value := lower(btrim(coalesce(item_value ->> 'unit', '')));
    item_notes_value := btrim(coalesce(item_value ->> 'notes', ''));

    if product_name_value = '' or char_length(product_name_value) > 160 then
      raise exception 'Daily Bazaar item % has an invalid product name', item_ordinality;
    end if;
    if category_value not in (
      'meat', 'poultry', 'vegetables', 'fruit', 'dairy', 'grocery',
      'spices', 'beverages', 'bakery', 'packaging', 'cleaning', 'charcoal'
    ) then
      raise exception 'Daily Bazaar item % has an invalid category', item_ordinality;
    end if;
    if unit_value not in (
      'kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'bag', 'bottle', 'bunch'
    ) then
      raise exception 'Daily Bazaar item % has an invalid unit', item_ordinality;
    end if;
    if coalesce(item_value ->> 'quantity', '') !~ '^[0-9]+(\.[0-9]{1,3})?$' then
      raise exception 'Daily Bazaar item % has an invalid quantity', item_ordinality;
    end if;

    quantity_value := (item_value ->> 'quantity')::numeric;
    if quantity_value <= 0 or quantity_value > 99999999999.999 then
      raise exception 'Daily Bazaar item % quantity is out of range', item_ordinality;
    end if;
    if unit_value in ('pcs', 'pack', 'box', 'bag', 'bottle', 'bunch')
      and quantity_value <> trunc(quantity_value) then
      raise exception 'Daily Bazaar item % requires a whole-number quantity', item_ordinality;
    end if;

    if coalesce(item_value ->> 'line_total', '') !~ '^[0-9]+$' then
      raise exception 'Daily Bazaar item % has an invalid line total', item_ordinality;
    end if;
    line_total_value := (item_value ->> 'line_total')::bigint;
    if line_total_value <= 0 or line_total_value > 2147483647 then
      raise exception 'Daily Bazaar item % line total is out of range', item_ordinality;
    end if;
    if char_length(item_notes_value) > 2000 then
      raise exception 'Daily Bazaar item % notes are too long', item_ordinality;
    end if;

    total_amount_value := total_amount_value + line_total_value;
    if total_amount_value > 2147483647 then
      raise exception 'Daily Bazaar total amount is out of range';
    end if;
  end loop;

  select coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    ''
  )
  into actor_name
  from public.profiles as profile
  where profile.id = auth.uid();

  select coalesce(
    nullif(btrim(profile.full_name), ''),
    nullif(btrim(profile.email), ''),
    ''
  )
  into buyer_name_value
  from public.profiles as profile
  where profile.id = buyer_profile_id_value
    and profile.status::text = 'active'
    and profile.role::text <> 'guest';

  if not found then
    raise exception 'Daily Bazaar buyer profile must be an active employee';
  end if;

  expense_description := case
    when notes_value <> '' then notes_value
    else 'Daily Bazaar purchase (' || jsonb_array_length(items_value)::text || ' items)'
  end;

  if purchase_id_value is null then
    perform set_config('app.daily_bazaar_rpc', 'on', true);

    insert into public.expenses (
      entry_type, expense_date, category, payment_method, amount, vendor,
      description, created_by, created_by_name, created_at, updated_at
    ) values (
      'expense',
      purchase_date_value,
      'products_bazaar',
      payment_method_value,
      total_amount_value::integer,
      '',
      expense_description,
      auth.uid(),
      actor_name,
      now(),
      now()
    )
    returning id into expense_id_value;

    insert into public.bazaar_purchases (
      request_key, expense_id, purchase_date, payment_method,
      buyer_profile_id, buyer_name, notes, total_amount, entry_source,
      created_by, created_by_name
    ) values (
      request_key_value,
      expense_id_value,
      purchase_date_value,
      payment_method_value,
      buyer_profile_id_value,
      buyer_name_value,
      notes_value,
      total_amount_value::integer,
      'daily_bazaar',
      auth.uid(),
      actor_name
    )
    returning id into purchase_id_value;
  else
    select *
    into existing_purchase
    from public.bazaar_purchases
    where id = purchase_id_value;

    if not found then
      raise exception 'Daily Bazaar purchase not found';
    end if;

    expense_id_value := existing_purchase.expense_id;

    -- Lock Accounting before Bazaar for every cross-ledger mutation.
    perform 1
    from public.expenses
    where id = expense_id_value
    for update;

    if not found then
      raise exception 'Linked Daily Bazaar expense not found';
    end if;

    select *
    into existing_purchase
    from public.bazaar_purchases
    where id = purchase_id_value
      and expense_id = expense_id_value
    for update;

    if not found then
      raise exception 'Daily Bazaar purchase not found';
    end if;
    if existing_purchase.entry_source = 'accounting_backfill' then
      raise exception 'Historical Accounting Bazaar entries cannot be edited from Daily Bazaar';
    end if;

    old_snapshot_value := public.build_bazaar_purchase_snapshot(purchase_id_value);

    perform set_config('app.daily_bazaar_rpc', 'on', true);

    update public.expenses
    set entry_type = 'expense',
        expense_date = purchase_date_value,
        category = 'products_bazaar',
        payment_method = payment_method_value,
        amount = total_amount_value::integer,
        vendor = '',
        description = expense_description,
        updated_at = now()
    where id = expense_id_value;

    update public.bazaar_purchases
    set purchase_date = purchase_date_value,
        payment_method = payment_method_value,
        buyer_profile_id = buyer_profile_id_value,
        buyer_name = buyer_name_value,
        notes = notes_value,
        total_amount = total_amount_value::integer,
        updated_at = now()
    where id = purchase_id_value;

    delete from public.bazaar_purchase_items
    where purchase_id = purchase_id_value;
  end if;

  for item_value, item_ordinality in
    select item.value, item.ordinality::integer
    from jsonb_array_elements(items_value) with ordinality as item(value, ordinality)
  loop
    item_id_value := coalesce(nullif(btrim(item_value ->> 'id'), '')::uuid, gen_random_uuid());
    product_name_value := btrim(item_value ->> 'product_name');
    category_value := lower(btrim(item_value ->> 'category'));
    quantity_value := (item_value ->> 'quantity')::numeric;
    unit_value := lower(btrim(item_value ->> 'unit'));
    line_total_value := (item_value ->> 'line_total')::bigint;
    item_notes_value := btrim(coalesce(item_value ->> 'notes', ''));

    insert into public.bazaar_purchase_items (
      id, purchase_id, product_name, product_key, category, quantity,
      unit, line_total, sort_order, notes
    ) values (
      item_id_value,
      purchase_id_value,
      product_name_value,
      public.normalize_bazaar_product_key(product_name_value),
      category_value,
      quantity_value,
      unit_value,
      line_total_value::integer,
      item_ordinality - 1,
      item_notes_value
    );

    insert into public.bazaar_product_catalog (
      product_key, product_name, category, unit, last_purchase_date,
      created_at, updated_at
    ) values (
      public.normalize_bazaar_product_key(product_name_value),
      product_name_value,
      category_value,
      unit_value,
      purchase_date_value,
      now(),
      now()
    )
    on conflict (product_key) do update
    set product_name = excluded.product_name,
        category = excluded.category,
        unit = excluded.unit,
        last_purchase_date = excluded.last_purchase_date,
        updated_at = now()
    where excluded.last_purchase_date >= bazaar_product_catalog.last_purchase_date;
  end loop;

  insert into public.bazaar_purchase_audit (
    purchase_id, action, old_snapshot, new_snapshot, changed_by, changed_by_name
  ) values (
    purchase_id_value,
    case when old_snapshot_value is null then 'insert' else 'update' end,
    old_snapshot_value,
    public.build_bazaar_purchase_snapshot(purchase_id_value),
    auth.uid(),
    actor_name
  );

  return jsonb_build_object(
    'id', purchase_id_value,
    'request_key', coalesce(request_key_value, existing_purchase.request_key),
    'expense_id', expense_id_value,
    'total_amount', total_amount_value::integer
  );
end;
$$;

create or replace function public.delete_bazaar_purchase(p_purchase_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_id_value uuid;
  purchase_source text;
begin
  if not public.current_staff_can_write('bazaar') then
    raise exception 'Daily Bazaar write access is required';
  end if;

  if p_purchase_id is null then
    return false;
  end if;

  select purchase.expense_id, purchase.entry_source
  into expense_id_value, purchase_source
  from public.bazaar_purchases as purchase
  where purchase.id = p_purchase_id;

  if not found then
    return false;
  end if;

  perform 1
  from public.expenses
  where id = expense_id_value
  for update;

  if not found then
    raise exception 'Linked Daily Bazaar expense not found';
  end if;

  select purchase.entry_source
  into purchase_source
  from public.bazaar_purchases as purchase
  where purchase.id = p_purchase_id
    and purchase.expense_id = expense_id_value
  for update;

  if not found then
    return false;
  end if;
  if purchase_source = 'accounting_backfill' then
    raise exception 'Historical Accounting Bazaar entries cannot be deleted from Daily Bazaar';
  end if;

  -- The expense cascade deletes the purchase and items; the purchase trigger
  -- records the complete immutable snapshot before deletion.
  perform set_config('app.daily_bazaar_rpc', 'on', true);

  delete from public.expenses
  where id = expense_id_value;

  if not found then
    raise exception 'Linked Daily Bazaar expense not found';
  end if;

  return true;
end;
$$;

alter table public.bazaar_purchases enable row level security;
alter table public.bazaar_purchase_items enable row level security;
alter table public.bazaar_product_catalog enable row level security;
alter table public.bazaar_purchase_audit enable row level security;

drop policy if exists bazaar_feature_read_purchases on public.bazaar_purchases;
create policy bazaar_feature_read_purchases
  on public.bazaar_purchases for select
  to authenticated
  using (public.current_staff_can_access('bazaar'));

drop policy if exists bazaar_feature_read_items on public.bazaar_purchase_items;
create policy bazaar_feature_read_items
  on public.bazaar_purchase_items for select
  to authenticated
  using (public.current_staff_can_access('bazaar'));

drop policy if exists bazaar_feature_read_product_catalog on public.bazaar_product_catalog;
create policy bazaar_feature_read_product_catalog
  on public.bazaar_product_catalog for select
  to authenticated
  using (public.current_staff_can_access('bazaar'));

drop policy if exists bazaar_feature_read_audit on public.bazaar_purchase_audit;
create policy bazaar_feature_read_audit
  on public.bazaar_purchase_audit for select
  to authenticated
  using (public.current_staff_can_access('bazaar'));

revoke all on table public.bazaar_purchases from public, anon, authenticated;
revoke all on table public.bazaar_purchase_items from public, anon, authenticated;
revoke all on table public.bazaar_product_catalog from public, anon, authenticated;
revoke all on table public.bazaar_purchase_audit from public, anon, authenticated;

grant select on table public.bazaar_purchases to authenticated;
grant select on table public.bazaar_purchase_items to authenticated;
grant select on table public.bazaar_product_catalog to authenticated;
grant select on table public.bazaar_purchase_audit to authenticated;

revoke all on function public.normalize_bazaar_product_key(text) from public, anon, authenticated;
revoke all on function public.build_bazaar_purchase_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.prevent_bazaar_purchase_audit_mutation() from public, anon, authenticated;
revoke all on function public.capture_bazaar_purchase_delete_audit() from public, anon, authenticated;
revoke all on function public.prevent_direct_structured_bazaar_expense_mutation() from public, anon, authenticated;
revoke all on function public.save_bazaar_purchase(jsonb) from public, anon, authenticated;
revoke all on function public.delete_bazaar_purchase(uuid) from public, anon, authenticated;

grant execute on function public.save_bazaar_purchase(jsonb) to authenticated;
grant execute on function public.delete_bazaar_purchase(uuid) to authenticated;

commit;
