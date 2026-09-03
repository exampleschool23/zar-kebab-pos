-- Let staff with Delete completed orders access correct completed-order payment
-- methods. The existing RPCs continue to preserve amounts, loyalty allocations,
-- items, totals, paid state/time, service snapshots, and stock deductions.

do $$
declare
  function_signature regprocedure;
  function_definition text;
begin
  foreach function_signature in array array[
    'public.guard_and_audit_order_payment()'::regprocedure,
    'public.change_paid_order_payment_method_owner(text[],text)'::regprocedure,
    'public.change_paid_order_payment_methods_owner(jsonb)'::regprocedure
  ]
  loop
    function_definition := pg_get_functiondef(function_signature);
    function_definition := replace(
      function_definition,
      'not public.current_staff_has_role(array[''owner''])',
      'not public.current_staff_can_access(''delete_paid_orders'')'
    );
    function_definition := replace(
      function_definition,
      'NOT public.current_staff_has_role(ARRAY[''owner''::text])',
      'NOT public.current_staff_can_access(''delete_paid_orders''::text)'
    );
    function_definition := replace(
      function_definition,
      'Only owner can change a completed order payment method',
      'Delete completed orders access is required to change a completed order payment method'
    );

    if position('current_staff_can_access(''delete_paid_orders'')' in function_definition) = 0 then
      raise exception 'Could not update payment correction authorization for %', function_signature;
    end if;

    execute function_definition;
  end loop;
end;
$$;

comment on function public.change_paid_order_payment_method_owner(text[], text) is
  'Corrects completed-order payment methods for staff with Delete completed orders access while preserving financial history.';

comment on function public.change_paid_order_payment_methods_owner(jsonb) is
  'Corrects individual completed-order payment methods for staff with Delete completed orders access while preserving amounts and loyalty.';
