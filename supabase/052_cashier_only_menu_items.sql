-- Cashier-only menu items
-- These stay available to staff/cashier quick items but are hidden from public,
-- Telegram, and waiter customer-facing menus.

alter table public.menu_items
  add column if not exists cashier_only boolean not null default false;

create index if not exists idx_menu_items_public_visible
  on public.menu_items(available, cashier_only, sort_order);

drop policy if exists "Public: read available menu items" on public.menu_items;
create policy "Public: read available menu items"
  on public.menu_items for select
  using (available = true and coalesce(cashier_only, false) = false);

create or replace function public.get_public_menu_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'categories',
      coalesce(
        (
          select jsonb_agg(to_jsonb(c) order by c.sort_order, c.created_at)
          from public.menu_categories c
        ),
        '[]'::jsonb
      ),
    'items',
      coalesce(
        (
          select jsonb_agg(to_jsonb(i) order by i.sort_order, i.created_at)
          from public.menu_items i
          where i.available = true
            and coalesce(i.cashier_only, false) = false
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.get_public_menu_data() to anon, authenticated;
