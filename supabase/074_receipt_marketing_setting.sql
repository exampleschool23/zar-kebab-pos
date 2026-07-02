-- ============================================================
-- Zar Kebab POS - Receipt marketing footer setting
-- Controls compact loyalty / Instagram footer content on receipts.
-- ============================================================

alter table public.business_settings
  add column if not exists receipt_marketing text not null default 'compactFooter'
    check (receipt_marketing in ('none', 'compactFooter', 'loyaltyOnly', 'instagramOnly', 'full'));

update public.business_settings
set receipt_marketing = 'compactFooter'
where id = 'default'
  and (receipt_marketing is null or receipt_marketing = '');
