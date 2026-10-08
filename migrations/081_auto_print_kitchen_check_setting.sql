-- Auto-print kitchen checks when a waiter submits an order.
alter table public.business_settings
  add column if not exists auto_print_kitchen_check boolean not null default false;

update public.business_settings
set auto_print_kitchen_check = false
where id = 'default'
  and auto_print_kitchen_check is null;

notify pgrst, 'reload schema';
