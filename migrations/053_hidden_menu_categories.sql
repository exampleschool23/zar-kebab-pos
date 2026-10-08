-- Hidden menu categories
-- Keeps categories/items available to admin/reporting while hiding whole groups
-- from public, Telegram, and waiter customer-facing menus.

alter table public.menu_categories
  add column if not exists hidden boolean not null default false;

create index if not exists idx_menu_categories_public_visible
  on public.menu_categories(hidden, sort_order);

drop policy if exists "Public: read menu categories" on public.menu_categories;
create policy "Public: read menu categories"
  on public.menu_categories for select
  using (coalesce(hidden, false) = false);

drop policy if exists "Public: read available menu items" on public.menu_items;
create policy "Public: read available menu items"
  on public.menu_items for select
  using (
    available = true
    and coalesce(cashier_only, false) = false
    and (
      menu_items.category_id is null
      or exists (
        select 1
        from public.menu_categories c
        where c.id = menu_items.category_id
          and coalesce(c.hidden, false) = false
      )
    )
  );

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
          where coalesce(c.hidden, false) = false
        ),
        '[]'::jsonb
      ),
    'items',
      coalesce(
        (
          select jsonb_agg(to_jsonb(i) order by i.sort_order, i.created_at)
          from public.menu_items i
          left join public.menu_categories c on c.id = i.category_id
          where i.available = true
            and coalesce(i.cashier_only, false) = false
            and (i.category_id is null or coalesce(c.hidden, false) = false)
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.get_public_menu_data() to anon, authenticated;
