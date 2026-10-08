-- Time-window and waiter-specific visibility for menu categories/items.
-- Empty time fields mean always visible. A window such as 11:00-14:00
-- shows the row from 11:00 up to, but not including, 14:00.

alter table public.menu_categories
  add column if not exists visible_from_time time,
  add column if not exists visible_until_time time;

alter table public.menu_items
  add column if not exists waiter_hidden boolean not null default false,
  add column if not exists visible_from_time time,
  add column if not exists visible_until_time time;

create index if not exists idx_menu_categories_visibility_window
  on public.menu_categories(hidden, waiter_hidden, visible_from_time, visible_until_time, sort_order);

create index if not exists idx_menu_items_visibility_window
  on public.menu_items(available, public_hidden, waiter_hidden, cashier_only, visible_from_time, visible_until_time, sort_order);

create or replace function public.menu_time_window_is_visible(
  p_start time,
  p_end time,
  p_now time
)
returns boolean
language sql
immutable
as $$
  select case
    when p_start is null and p_end is null then true
    when p_start is not null and p_end is null then p_now >= p_start
    when p_start is null and p_end is not null then p_now < p_end
    when p_start = p_end then true
    when p_start < p_end then p_now >= p_start and p_now < p_end
    else p_now >= p_start or p_now < p_end
  end;
$$;

grant execute on function public.menu_time_window_is_visible(time, time, time) to anon, authenticated;

drop policy if exists "Public: read menu categories" on public.menu_categories;
create policy "Public: read menu categories"
  on public.menu_categories for select
  using (
    coalesce(hidden, false) = false
    and public.menu_time_window_is_visible(
      visible_from_time,
      visible_until_time,
      timezone('Asia/Tashkent', now())::time
    )
  );

drop policy if exists "Public: read available menu items" on public.menu_items;
create policy "Public: read available menu items"
  on public.menu_items for select
  using (
    available = true
    and coalesce(cashier_only, false) = false
    and coalesce(public_hidden, false) = false
    and deleted_at is null
    and public.menu_time_window_is_visible(
      visible_from_time,
      visible_until_time,
      timezone('Asia/Tashkent', now())::time
    )
    and (
      menu_items.category_id is null
      or exists (
        select 1
        from public.menu_categories c
        where c.id = menu_items.category_id
          and coalesce(c.hidden, false) = false
          and public.menu_time_window_is_visible(
            c.visible_from_time,
            c.visible_until_time,
            timezone('Asia/Tashkent', now())::time
          )
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
  with current_menu_time as (
    select timezone('Asia/Tashkent', now())::time as value
  )
  select jsonb_build_object(
    'categories',
      coalesce(
        (
          select jsonb_agg(to_jsonb(c) order by c.sort_order, c.created_at)
          from public.menu_categories c, current_menu_time t
          where coalesce(c.hidden, false) = false
            and public.menu_time_window_is_visible(c.visible_from_time, c.visible_until_time, t.value)
        ),
        '[]'::jsonb
      ),
    'items',
      coalesce(
        (
          select jsonb_agg(to_jsonb(i) order by i.sort_order, i.created_at)
          from public.menu_items i
          left join public.menu_categories c on c.id = i.category_id,
          current_menu_time t
          where i.available = true
            and coalesce(i.cashier_only, false) = false
            and coalesce(i.public_hidden, false) = false
            and i.deleted_at is null
            and public.menu_time_window_is_visible(i.visible_from_time, i.visible_until_time, t.value)
            and (
              i.category_id is null
              or (
                coalesce(c.hidden, false) = false
                and public.menu_time_window_is_visible(c.visible_from_time, c.visible_until_time, t.value)
              )
            )
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.get_public_menu_data() to anon, authenticated;

notify pgrst, 'reload schema';
