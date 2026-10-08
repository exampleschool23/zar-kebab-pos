-- New Telegram queue work wakes its sender immediately; a 15-minute sweep
-- replaces the minute cron from 218 and only retries what is still pending.
-- Each pg_cron run logs two Postgres lines, so the minute job alone wrote
-- about 2,900 lines a day. Senders claim rows with compare-and-set, so a kick
-- racing the sweep cannot send twice. Kicks fire only for new work, never for
-- the senders' own status updates, and never fail the write that caused them.
begin;

create or replace function public.invoke_telegram_queues()
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Isolate each queue so one failure does not hold back the others.
  begin
    perform public.invoke_game_club_team_notifications();
  exception when others then
    raise warning 'game-club queue dispatch failed: %', sqlerrm;
  end;
  begin
    perform public.invoke_order_status_cleanup();
  exception when others then
    raise warning 'order-status cleanup dispatch failed: %', sqlerrm;
  end;
  begin
    perform public.invoke_ingredient_investor_notifications();
  exception when others then
    raise warning 'ingredient queue dispatch failed: %', sqlerrm;
  end;
  begin
    perform public.invoke_employee_order_kpi_notifications();
  exception when others then
    raise warning 'employee KPI queue dispatch failed: %', sqlerrm;
  end;
end;
$$;
revoke all on function public.invoke_telegram_queues() from public, anon, authenticated;

-- One request per queue per transaction; pg_net sends it after commit.
create or replace function public.kick_telegram_queue(p_task text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  flag text := 'zar_kebab.kicked_' || replace(p_task, '-', '_');
begin
  if current_setting(flag, true) = 'on' then return; end if;
  perform set_config(flag, 'on', true);
  case p_task
    when 'game-club-orders' then perform public.invoke_game_club_team_notifications();
    when 'order-status-cleanup' then perform public.invoke_order_status_cleanup();
    when 'ingredient-events' then perform public.invoke_ingredient_investor_notifications();
    when 'employee-order-kpi' then perform public.invoke_employee_order_kpi_notifications();
  end case;
exception when others then
  raise warning 'telegram queue kick % failed: %', p_task, sqlerrm;
end;
$$;
revoke all on function public.kick_telegram_queue(text) from public, anon, authenticated;

create or replace function public.kick_game_club_team_queue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where status = 'queued') then
    perform public.kick_telegram_queue('game-club-orders');
  end if;
  return null;
end;
$$;
revoke all on function public.kick_game_club_team_queue() from public, anon, authenticated;
drop trigger if exists kick_game_club_team_queue on public.game_club_team_notifications;
create trigger kick_game_club_team_queue after insert on public.game_club_team_notifications
  referencing new table as new_rows for each statement
  execute function public.kick_game_club_team_queue();

create or replace function public.kick_ingredient_investor_queue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where status = 'queued') then
    perform public.kick_telegram_queue('ingredient-events');
  end if;
  return null;
end;
$$;
revoke all on function public.kick_ingredient_investor_queue() from public, anon, authenticated;
drop trigger if exists kick_ingredient_investor_queue on public.ingredient_investor_notifications;
create trigger kick_ingredient_investor_queue after insert on public.ingredient_investor_notifications
  referencing new table as new_rows for each statement
  execute function public.kick_ingredient_investor_queue();

-- Order status messages need a kick once a sent message must be retracted.
create or replace function public.kick_order_status_cleanup_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows
             where delete_requested and deleted_at is null and message_id is not null) then
    perform public.kick_telegram_queue('order-status-cleanup');
  end if;
  return null;
end;
$$;
revoke all on function public.kick_order_status_cleanup_insert() from public, anon, authenticated;
drop trigger if exists kick_order_status_cleanup_insert on public.order_status_telegram_messages;
create trigger kick_order_status_cleanup_insert after insert on public.order_status_telegram_messages
  referencing new table as new_rows for each statement
  execute function public.kick_order_status_cleanup_insert();

create or replace function public.kick_order_status_cleanup_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows n join old_rows o on o.id = n.id
             where n.delete_requested and n.deleted_at is null and n.message_id is not null
               and not (o.delete_requested and o.message_id is not null)) then
    perform public.kick_telegram_queue('order-status-cleanup');
  end if;
  return null;
end;
$$;
revoke all on function public.kick_order_status_cleanup_update() from public, anon, authenticated;
drop trigger if exists kick_order_status_cleanup_update on public.order_status_telegram_messages;
create trigger kick_order_status_cleanup_update after update on public.order_status_telegram_messages
  referencing old table as old_rows new table as new_rows for each statement
  execute function public.kick_order_status_cleanup_update();

-- Employee KPI notices: new sends, and retraction once an order is deleted.
create or replace function public.kick_employee_order_kpi_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows where status = 'queued' and not delete_requested) then
    perform public.kick_telegram_queue('employee-order-kpi');
  end if;
  return null;
end;
$$;
revoke all on function public.kick_employee_order_kpi_insert() from public, anon, authenticated;
drop trigger if exists kick_employee_order_kpi_insert on public.employee_order_kpi_notifications;
create trigger kick_employee_order_kpi_insert after insert on public.employee_order_kpi_notifications
  referencing new table as new_rows for each statement
  execute function public.kick_employee_order_kpi_insert();

create or replace function public.kick_employee_order_kpi_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows n join old_rows o on o.id = n.id
             where n.delete_requested and n.deleted_at is null and n.telegram_message_id is not null
               and not (o.delete_requested and o.telegram_message_id is not null)) then
    perform public.kick_telegram_queue('employee-order-kpi');
  end if;
  return null;
end;
$$;
revoke all on function public.kick_employee_order_kpi_update() from public, anon, authenticated;
drop trigger if exists kick_employee_order_kpi_update on public.employee_order_kpi_notifications;
create trigger kick_employee_order_kpi_update after update on public.employee_order_kpi_notifications
  referencing old table as old_rows new table as new_rows for each statement
  execute function public.kick_employee_order_kpi_update();

do $$
declare existing_id bigint;
begin
  for existing_id in select jobid from cron.job where jobname in (
    'zar-kebab-game-club-team',
    'zar-kebab-order-status-cleanup',
    'zar-kebab-ingredient-investor',
    'zar-kebab-employee-order-kpi',
    'zar-kebab-minute-queues',
    'zar-kebab-queue-sweep'
  ) loop
    perform cron.unschedule(existing_id);
  end loop;
  perform cron.schedule('zar-kebab-queue-sweep', '*/15 * * * *',
    'select public.invoke_telegram_queues();');
end $$;

drop function if exists public.invoke_minute_telegram_queues();
commit;
