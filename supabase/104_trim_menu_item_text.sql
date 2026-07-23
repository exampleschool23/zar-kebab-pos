-- Keep menu product names and descriptions free of accidental outer whitespace.
-- Internal whitespace and line breaks are preserved.

create or replace function public.trim_menu_item_text_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name_uz := regexp_replace(coalesce(new.name_uz, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g');
  new.name_ru := regexp_replace(coalesce(new.name_ru, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g');
  new.name_en := regexp_replace(coalesce(new.name_en, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g');
  new.description_uz := regexp_replace(coalesce(new.description_uz, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g');
  new.description_ru := regexp_replace(coalesce(new.description_ru, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g');
  new.description_en := regexp_replace(coalesce(new.description_en, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g');
  return new;
end;
$$;

revoke all on function public.trim_menu_item_text_columns()
  from public, anon, authenticated;

update public.menu_items
set
  name_uz = regexp_replace(coalesce(name_uz, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g'),
  name_ru = regexp_replace(coalesce(name_ru, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g'),
  name_en = regexp_replace(coalesce(name_en, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g'),
  description_uz = regexp_replace(coalesce(description_uz, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g'),
  description_ru = regexp_replace(coalesce(description_ru, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g'),
  description_en = regexp_replace(coalesce(description_en, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g')
where
  name_uz is distinct from regexp_replace(coalesce(name_uz, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g')
  or name_ru is distinct from regexp_replace(coalesce(name_ru, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g')
  or name_en is distinct from regexp_replace(coalesce(name_en, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g')
  or description_uz is distinct from regexp_replace(coalesce(description_uz, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g')
  or description_ru is distinct from regexp_replace(coalesce(description_ru, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g')
  or description_en is distinct from regexp_replace(coalesce(description_en, ''), '(^[[:space:]]+)|([[:space:]]+$)', '', 'g');

drop trigger if exists trg_trim_menu_item_text on public.menu_items;
create trigger trg_trim_menu_item_text
before insert or update of
  name_uz,
  name_ru,
  name_en,
  description_uz,
  description_ru,
  description_en
on public.menu_items
for each row
execute function public.trim_menu_item_text_columns();
