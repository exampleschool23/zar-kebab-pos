-- Preserve the exact private Telegram chat used for each salary-payment
-- message so later employee relinking cannot redirect message retraction.

alter table public.employee_salary_payment_notification_deliveries
  add column if not exists employee_chat_id text;

update public.employee_salary_payment_notification_deliveries delivery
set employee_chat_id = employee_link.chat_id
from public.employee_salary_telegram_links employee_link
where employee_link.salary_profile_id = delivery.salary_profile_id
  and delivery.telegram_message_id is not null
  and nullif(trim(delivery.employee_chat_id), '') is null
  and nullif(trim(employee_link.chat_id), '') is not null;

create or replace function public.snapshot_salary_payment_employee_chat_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.telegram_message_id is not null
     and nullif(trim(new.employee_chat_id), '') is null then
    select nullif(trim(employee_link.chat_id), '')
    into new.employee_chat_id
    from public.employee_salary_telegram_links employee_link
    where employee_link.salary_profile_id = new.salary_profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists snapshot_salary_payment_employee_chat_id_trigger
  on public.employee_salary_payment_notification_deliveries;
create trigger snapshot_salary_payment_employee_chat_id_trigger
before update of telegram_message_id
on public.employee_salary_payment_notification_deliveries
for each row execute function public.snapshot_salary_payment_employee_chat_id();

revoke all on function public.snapshot_salary_payment_employee_chat_id()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
