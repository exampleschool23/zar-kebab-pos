-- Allow admins to register loyalty cards.
-- Balance changes and deactivation remain owner/cashier/owner-only per existing policies.

alter table public.loyalty_cards enable row level security;

drop policy if exists owner_create_loyalty_cards on public.loyalty_cards;
drop policy if exists owner_admin_create_loyalty_cards on public.loyalty_cards;

create policy owner_admin_create_loyalty_cards
  on public.loyalty_cards
  for insert
  with check (public.current_staff_has_role(array['owner','admin']));
