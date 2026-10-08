-- Keep temporarily unavailable meals visible to customers while preserving the
-- explicit public-hidden, schedule, cashier-only, and archive boundaries. The
-- customer menus deliberately ignore `available`; waiter menus use it as their
-- visibility and orderability control in the application layer.

begin;

drop policy if exists "Public: read available menu items" on public.menu_items;
drop policy if exists "Public: read customer menu items" on public.menu_items;
create policy "Public: read customer menu items"
  on public.menu_items for select
  using (
    coalesce(cashier_only, false) = false
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
          and c.deleted_at is null
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
            and c.deleted_at is null
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
          where coalesce(i.cashier_only, false) = false
            and coalesce(i.public_hidden, false) = false
            and i.deleted_at is null
            and public.menu_time_window_is_visible(i.visible_from_time, i.visible_until_time, t.value)
            and (
              i.category_id is null
              or (
                coalesce(c.hidden, false) = false
                and c.deleted_at is null
                and public.menu_time_window_is_visible(c.visible_from_time, c.visible_until_time, t.value)
              )
            )
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.get_public_menu_data() to anon, authenticated;

commit;

notify pgrst, 'reload schema';
