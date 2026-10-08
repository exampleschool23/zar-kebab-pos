-- Schedule exceptions belong to the order channel, independently of staff identity.
alter table public.menu_categories
  add column if not exists always_visible_game_club boolean not null default false,
  add column if not exists always_visible_take_away boolean not null default false,
  add column if not exists always_visible_delivery boolean not null default false;

comment on column public.menu_categories.always_visible_game_club is
  'Bypass the category time window for Game Club staff orders; preserve archival and visibility restrictions.';

comment on column public.menu_categories.always_visible_take_away is
  'Bypass the category time window for Take Away staff orders; preserve archival and visibility restrictions.';
comment on column public.menu_categories.always_visible_delivery is
  'Bypass the category time window for Delivery staff orders; preserve archival and visibility restrictions.';

-- Identify the existing lunch category once; subsequent renames preserve the setting.
update public.menu_categories
set always_visible_game_club = true
where exists (
  select 1
  from unnest(array[name_en, name_ru, name_uz]) as names(value)
  where regexp_replace(lower(value), '[[:space:]‐‑–—-]+', '', 'g')
    in ('businesslunch', 'бизнесланч', 'bizneslanch')
);
