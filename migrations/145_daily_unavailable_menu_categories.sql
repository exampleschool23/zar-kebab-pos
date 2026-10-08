-- Preserve the Russian category snapshot sent with every future 08:00
-- unavailable-menu report. Existing delivery history remains unchanged.

begin;

alter table public.daily_unavailable_menu_notification_deliveries
  add column if not exists item_categories jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_unavailable_menu_notification_deliveries'::regclass
      and conname = 'daily_unavailable_menu_item_categories_array_check'
  ) then
    alter table public.daily_unavailable_menu_notification_deliveries
      add constraint daily_unavailable_menu_item_categories_array_check
      check (jsonb_typeof(item_categories) = 'array');
  end if;
end;
$$;

comment on column public.daily_unavailable_menu_notification_deliveries.item_categories is
  'Russian category-name snapshots aligned with item_ids and item_names for the sent report.';

commit;

notify pgrst, 'reload schema';
