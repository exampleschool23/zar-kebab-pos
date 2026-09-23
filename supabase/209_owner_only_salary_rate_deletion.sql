-- Restrictive policy also applies alongside legacy FOR ALL write policies.
begin;

create policy owner_only_delete_salary_rates
  on public.employee_salary_rates
  as restrictive for delete
  to authenticated
  using (public.current_staff_role() = 'owner');

commit;
