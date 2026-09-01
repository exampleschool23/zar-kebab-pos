-- Tech Card staff need the canonical Bazaar ingredient names and normal prices
-- to compose protected recipes. Purchase history and Bazaar writes remain gated
-- by their existing policies and owner-only RPCs.
begin;

drop policy if exists bazaar_feature_read_product_catalog on public.bazaar_product_catalog;
create policy bazaar_feature_read_product_catalog
  on public.bazaar_product_catalog for select
  to authenticated
  using (
    public.current_staff_can_access('bazaar')
    or public.current_staff_can_access('tech_cards')
  );

commit;
