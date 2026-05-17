-- Add the Guest role and allow anonymous visitors to read the public menu only.

alter table public.profiles
  alter column role set default 'guest';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'waiter', 'cashier', 'kitchen', 'stakeholder', 'guest'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    'guest',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop policy if exists "Public: read menu categories" on public.menu_categories;
create policy "Public: read menu categories"
  on public.menu_categories for select
  using (true);

drop policy if exists "Public: read available menu items" on public.menu_items;
create policy "Public: read available menu items"
  on public.menu_items for select
  using (available = true);

create or replace function public.get_public_menu_data()
returns jsonb
language sql
security definer
stable
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
        ),
        '[]'::jsonb
      )
  );
$$;

grant execute on function public.get_public_menu_data() to anon, authenticated;
