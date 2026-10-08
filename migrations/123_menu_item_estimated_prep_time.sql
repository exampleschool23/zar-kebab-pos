-- Every menu product exposes an estimated preparation time to customers and
-- waiters. Existing products receive the restaurant default of 15 minutes.

alter table public.menu_items
  add column if not exists estimated_prep_minutes integer not null default 15;

update public.menu_items
set estimated_prep_minutes = 15
where estimated_prep_minutes is null
   or estimated_prep_minutes < 1
   or estimated_prep_minutes > 180;

alter table public.menu_items
  drop constraint if exists menu_items_estimated_prep_minutes_range;

alter table public.menu_items
  add constraint menu_items_estimated_prep_minutes_range
  check (estimated_prep_minutes between 1 and 180);

-- Migration 103 owns the public product-creation wrapper. Extend it so new
-- products can save their configured estimate while the lower-level atomic
-- cost RPC continues to provide the safe 15-minute database default.
create or replace function public.create_menu_item_with_media_and_cost(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_item jsonb;
  inserted_id text;
  normalized_media_urls text[] := array[]::text[];
  target_prep_minutes integer := 15;
  updated_item public.menu_items%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'A menu item payload is required' using errcode = '22023';
  end if;

  if payload ? 'media_urls'
     and jsonb_typeof(payload -> 'media_urls') is distinct from 'array' then
    raise exception 'Menu media URLs must be an array' using errcode = '22023';
  end if;

  if nullif(btrim(payload ->> 'estimated_prep_minutes'), '') is not null then
    if btrim(payload ->> 'estimated_prep_minutes') !~ '^[0-9]+$' then
      raise exception 'Preparation time must be a whole number from 1 to 180'
        using errcode = '22023';
    end if;
    target_prep_minutes := (payload ->> 'estimated_prep_minutes')::integer;
  end if;

  if target_prep_minutes not between 1 and 180 then
    raise exception 'Preparation time must be a whole number from 1 to 180'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(media_url order by first_position),
    array[]::text[]
  )
  into normalized_media_urls
  from (
    select
      btrim(media.value) as media_url,
      min(media.position) as first_position
    from jsonb_array_elements_text(coalesce(payload -> 'media_urls', '[]'::jsonb))
      with ordinality as media(value, position)
    where nullif(btrim(media.value), '') is not null
    group by btrim(media.value)
  ) normalized;

  if cardinality(normalized_media_urls) = 0
     and nullif(btrim(payload ->> 'image_url'), '') is not null then
    normalized_media_urls := array[btrim(payload ->> 'image_url')];
  end if;

  inserted_item := public.create_menu_item_with_cost(
    payload || jsonb_build_object(
      'image_url',
      coalesce(normalized_media_urls[1], '')
    )
  );
  inserted_id := inserted_item ->> 'id';

  update public.menu_items
  set
    image_url = coalesce(normalized_media_urls[1], ''),
    media_urls = normalized_media_urls,
    estimated_prep_minutes = target_prep_minutes
  where id = inserted_id
  returning * into updated_item;

  if updated_item.id is null then
    raise exception 'Created menu item could not be updated with media'
      using errcode = 'P0001';
  end if;

  return to_jsonb(updated_item);
end;
$$;

revoke all on function public.create_menu_item_with_media_and_cost(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_menu_item_with_media_and_cost(jsonb)
  to authenticated;

notify pgrst, 'reload schema';
