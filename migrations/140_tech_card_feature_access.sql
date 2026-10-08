-- Give protected recipe/technology cards their own per-user page access.
-- Reading requires Tech Cards access. Saving additionally remains behind
-- Manage Menu so a user may be granted read-only recipe access.

begin;

alter table public.profiles
  drop constraint if exists profiles_feature_access_valid;

alter table public.profiles
  add constraint profiles_feature_access_valid
  check (
    feature_access is null
    or (
      feature_access <@ array[
        'dashboard', 'tables', 'menu', 'cashier', 'loyalty', 'expenses',
        'bazaar', 'tech_cards', 'team', 'reports', 'audit', 'settings',
        'off_premise_orders', 'delete_paid_orders'
      ]::text[]
      and (
        not ('off_premise_orders' = any(feature_access))
        or 'tables' = any(feature_access)
      )
      and (
        not ('delete_paid_orders' = any(feature_access))
        or feature_access && array['dashboard', 'cashier', 'reports']::text[]
      )
    )
  );

drop policy if exists "Staff can read menu tech cards" on public.menu_item_tech_cards;
create policy "Staff can read menu tech cards"
  on public.menu_item_tech_cards for select
  to authenticated
  using (public.current_staff_can_access('tech_cards'));

drop policy if exists "Staff can read tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Staff can read tech card ingredients"
  on public.menu_item_tech_card_ingredients for select
  to authenticated
  using (public.current_staff_can_access('tech_cards'));

drop policy if exists "Menu writers can create tech cards" on public.menu_item_tech_cards;
create policy "Menu writers can create tech cards"
  on public.menu_item_tech_cards for insert
  to authenticated
  with check (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

drop policy if exists "Menu writers can update tech cards" on public.menu_item_tech_cards;
create policy "Menu writers can update tech cards"
  on public.menu_item_tech_cards for update
  to authenticated
  using (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  )
  with check (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

drop policy if exists "Menu writers can delete tech cards" on public.menu_item_tech_cards;
create policy "Menu writers can delete tech cards"
  on public.menu_item_tech_cards for delete
  to authenticated
  using (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

drop policy if exists "Menu writers can create tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Menu writers can create tech card ingredients"
  on public.menu_item_tech_card_ingredients for insert
  to authenticated
  with check (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

drop policy if exists "Menu writers can update tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Menu writers can update tech card ingredients"
  on public.menu_item_tech_card_ingredients for update
  to authenticated
  using (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  )
  with check (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

drop policy if exists "Menu writers can delete tech card ingredients" on public.menu_item_tech_card_ingredients;
create policy "Menu writers can delete tech card ingredients"
  on public.menu_item_tech_card_ingredients for delete
  to authenticated
  using (
    public.current_staff_can_access('tech_cards')
    and public.current_staff_can_write('menu')
  );

-- The Tech Cards page compares its calculated portion cost with the protected
-- current catalog cost. Keep Accounting's existing read access intact.
drop policy if exists "feature_access_read_menu_item_costs" on public.menu_item_costs;
create policy "feature_access_read_menu_item_costs"
  on public.menu_item_costs for select
  to authenticated
  using (public.current_staff_can_access_any(array['dashboard', 'menu', 'expenses', 'tech_cards']));

commit;

notify pgrst, 'reload schema';
