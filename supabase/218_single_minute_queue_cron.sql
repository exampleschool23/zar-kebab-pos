-- One minute cron replaces the four queue crons from 180, 185, 189 and 197.
-- Every pg_cron run writes a "starting" and a "completed" Postgres log line, so
-- four jobs wrote about 11,500 lines a day and exceeded the Free Plan log quota.
-- Cadence, retries and endpoints are unchanged: each invoker still calls the
-- sender only when its own queue has work. Reapplying 180/185/189/197 restores
-- their separate jobs; reapply this migration afterwards.
begin;

create or replace function public.invoke_minute_telegram_queues()
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
revoke all on function public.invoke_minute_telegram_queues() from public, anon, authenticated;

do $$
declare existing_id bigint;
begin
  for existing_id in select jobid from cron.job where jobname in (
    'zar-kebab-game-club-team',
    'zar-kebab-order-status-cleanup',
    'zar-kebab-ingredient-investor',
    'zar-kebab-employee-order-kpi',
    'zar-kebab-minute-queues'
  ) loop
    perform cron.unschedule(existing_id);
  end loop;
  perform cron.schedule('zar-kebab-minute-queues', '* * * * *',
    'select public.invoke_minute_telegram_queues();');
end $$;
commit;
