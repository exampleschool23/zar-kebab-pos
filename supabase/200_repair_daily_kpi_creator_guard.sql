-- Repair live guard drift: the old English creator label rejects the Russian
-- label written by the automatic finalizer. Preserve actor checks and immutable
-- bonuses; no historical rows or finalization results are changed.
begin;

create or replace function public.protect_daily_kpi_bonus_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.source_type = 'daily_kpi' and (
      auth.uid() is not null
      or new.created_by is not null
      or new.created_by_name is distinct from 'Автоматический KPI'
    ) then
      raise exception 'Daily KPI bonuses can be created only by the automatic finalizer';
    end if;
    return new;
  end if;

  if old.source_type = 'daily_kpi' or new.source_type = 'daily_kpi' then
    raise exception 'Generated daily KPI bonuses are immutable; delete the bonus to void it';
  end if;

  return new;
end;
$$;

commit;
