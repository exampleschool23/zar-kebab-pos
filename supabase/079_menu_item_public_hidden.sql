-- Hide selected available items from public/Telegram menus while keeping them orderable by waiters.
alter table public.menu_items
  add column if not exists public_hidden boolean not null default false;

create index if not exists idx_menu_items_public_visible
  on public.menu_items(available, public_hidden, cashier_only, sort_order);

drop policy if exists "Public: read available menu items" on public.menu_items;
create policy "Public: read available menu items"
  on public.menu_items for select
  using (
    available = true
    and coalesce(cashier_only, false) = false
    and coalesce(public_hidden, false) = false
    and deleted_at is null
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
            and coalesce(i.public_hidden, false) = false
            and i.deleted_at is null
            and (i.category_id is null or coalesce(c.hidden, false) = false)
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.get_public_menu_data() to anon, authenticated;
