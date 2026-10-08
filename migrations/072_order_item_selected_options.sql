-- Persist selected product variants/options on order items.
-- menu_item_id remains the parent product id for menu lookup and reporting.

alter table public.order_items
  add column if not exists selected_options jsonb not null default '{}'::jsonb;

update public.order_items
set selected_options = '{}'::jsonb
where selected_options is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_selected_options_object'
  ) then
    alter table public.order_items
      add constraint order_items_selected_options_object
      check (jsonb_typeof(selected_options) = 'object')
      not valid;
  end if;
end $$;

alter table public.order_items
  validate constraint order_items_selected_options_object;
