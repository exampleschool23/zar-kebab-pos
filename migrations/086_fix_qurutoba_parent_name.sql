-- Qurutoba portions are variants. Keep the parent name neutral so the
-- 145,000 UZS 2–3 person choice is never presented as a 1-person dish.

update public.menu_items
set
  name_uz = 'Qurutob',
  name_ru = 'Курутоба',
  name_en = 'Qurutoba'
where external_id = 'MI-1C334BBA79'
  and (
    name_uz = 'Qurutob (1 kishilik)'
    or name_ru = 'Курутоба (1 человек)'
    or name_en = 'Qurutoba (1 person)'
  );
