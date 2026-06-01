-- Replace dynamic starter menu image URLs with direct images.unsplash.com URLs
-- so already-inserted rows load reliably.

update public.menu_categories as category
set image_url = fixed.image_url
from (
  values
    ('combos', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=200&q=80'),
    ('sides', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&q=80'),
    ('desserts', 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=200&q=80')
) as fixed(id, image_url)
where category.id = fixed.id;

update public.menu_items as item
set image_url = fixed.image_url
from (
  values
    ('zk_lamb_ribs', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80'),
    ('zk_chicken_wings', 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&q=80'),
    ('zk_liver_shashlik', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80'),
    ('zk_veg_shashlik', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80'),
    ('zk_mixed_grill', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80'),
    ('zk_lunch_kebab_set', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80'),
    ('zk_student_set', 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400&q=80'),
    ('zk_family_grill_set', 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80'),
    ('zk_takeaway_box', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&q=80'),
    ('zk_shorva', 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&q=80'),
    ('zk_mastava', 'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&q=80'),
    ('zk_plov', 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80'),
    ('zk_qurutob', 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80'),
    ('zk_chicken_rice', 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80'),
    ('zk_kazan_kebab', 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80'),
    ('zk_garden_salad', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80'),
    ('zk_suzma_salad', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80'),
    ('zk_spicy_carrot', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80'),
    ('zk_fries', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80'),
    ('zk_rice_side', 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80'),
    ('zk_grilled_veg_side', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80'),
    ('zk_pickles', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&q=80'),
    ('zk_ayran', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80'),
    ('zk_compote', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=80'),
    ('zk_lemonade', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80'),
    ('zk_chak_chak', 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80'),
    ('zk_honey_cake', 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80'),
    ('zk_baklava', 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80'),
    ('zk_ice_cream', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80')
) as fixed(id, image_url)
where item.id = fixed.id;
