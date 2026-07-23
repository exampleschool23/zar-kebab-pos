-- Menu products may have several public images, GIFs, or videos.
-- image_url remains the backward-compatible primary/cover media URL.

alter table public.menu_items
  add column if not exists media_urls text[] not null default array[]::text[];

update public.menu_items
set media_urls = array[image_url]
where cardinality(media_urls) = 0
  and nullif(btrim(image_url), '') is not null;

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
  updated_item public.menu_items%rowtype;
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'A menu item payload is required' using errcode = '22023';
  end if;

  if payload ? 'media_urls'
     and jsonb_typeof(payload -> 'media_urls') is distinct from 'array' then
    raise exception 'Menu media URLs must be an array' using errcode = '22023';
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
    media_urls = normalized_media_urls
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
