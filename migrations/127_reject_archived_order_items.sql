-- Archiving a menu product must immediately make it impossible to add that
-- product to a new kitchen round. The client also checks deleted_at, but this
-- trigger closes the race for stale tabs and direct database writes.

begin;

create or replace function public.reject_archived_menu_item_ordering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_at timestamptz;
begin
  -- Cashier-created ad-hoc items do not reference the menu catalog.
  if new.menu_item_id is null then
    return new;
  end if;

  -- Historical/status updates and quantity reductions remain valid. A quantity
  -- increase is a new sale and must still reference an active catalog row.
  if tg_op = 'UPDATE' then
    if new.menu_item_id is not distinct from old.menu_item_id
      and coalesce(new.quantity, 0) <= coalesce(old.quantity, 0)
    then
      return new;
    end if;
  end if;

  -- Serialize against the archive UPDATE. If ordering locks the product first,
  -- that order finishes before archival; if archival locks first, this SELECT
  -- waits and then observes deleted_at.
  select item.deleted_at
    into archived_at
    from public.menu_items item
    where item.id = new.menu_item_id
    for share;

  if not found or archived_at is not null then
    raise exception 'Menu item % is archived or missing from the catalog', new.menu_item_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reject_archived_order_item on public.order_items;
create trigger trg_reject_archived_order_item
  before insert or update of menu_item_id, quantity on public.order_items
  for each row execute function public.reject_archived_menu_item_ordering();

revoke all on function public.reject_archived_menu_item_ordering() from public;
revoke all on function public.reject_archived_menu_item_ordering() from anon;
revoke all on function public.reject_archived_menu_item_ordering() from authenticated;

commit;

notify pgrst, 'reload schema';
