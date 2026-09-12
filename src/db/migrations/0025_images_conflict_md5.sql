-- Las imagenes pasaron de unique (store_product_id, url) a un indice sobre
-- md5(url) para ahorrar espacio. La funcion de ingesta tiene que usar la misma
-- expresion en su on conflict o falla con "no unique or exclusion constraint".
-- Este archivo redefine ingest_store_products con ese unico cambio.

create or replace function find_your_prices.to_gtin14(input text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when digits is null or length(digits) not between 8 and 14 then null
    when digits ~ '^0+$' then null
    else lpad(digits, 14, '0')
  end
  from (select regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') as digits) s;
$$;

-- -----------------------------------------------------------------------------
-- ingest_store_products
--
-- p_items es un array json donde cada elemento trae las columnas de
-- store_products con el mismo nombre, mas dos arrays opcionales: "images" y
-- "variants". El contrato exacto vive en src/server/scraping/types.ts.
--
-- Devuelve un objeto con los contadores que el runner guarda en scrape_runs.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.ingest_store_products(
  p_store_id uuid,
  p_run_id   uuid,
  p_items    jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_found         integer := 0;
  v_new           integer := 0;
  v_updated       integer := 0;
  v_unchanged     integer := 0;
  v_price_changes integer := 0;
  v_now           timestamptz := now();
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items debe ser un array json';
  end if;

  if jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('items_found', 0, 'items_new', 0, 'items_updated', 0,
                              'items_unchanged', 0, 'price_changes', 0);
  end if;

  -- 1) Materializar el lote entrante ya tipado. El distinct on protege contra
  --    external_id repetidos: on conflict do update no puede tocar dos veces la
  --    misma fila dentro de un mismo comando.
  create temp table _incoming on commit drop as
  select distinct on (i->>'external_id')
    nullif(i->>'external_id', '')                       as external_id,
    nullif(i->>'external_code', '')                     as external_code,
    nullif(i->>'sku', '')                               as sku,
    nullif(i->>'mpn', '')                               as mpn,
    coalesce(
      find_your_prices.to_gtin14(i->>'gtin'),
      find_your_prices.to_gtin14(i->>'barcode_raw'),
      find_your_prices.to_gtin14(i->>'ean'),
      find_your_prices.to_gtin14(i->>'upc')
    )                                                   as gtin,
    nullif(i->>'barcode_raw', '')                       as barcode_raw,
    nullif(i->>'ean', '')                               as ean,
    nullif(i->>'upc', '')                               as upc,
    nullif(i->>'isbn', '')                              as isbn,
    nullif(i->>'asin', '')                              as asin,
    nullif(i->>'seller_name', '')                       as seller_name,
    nullif(i->>'seller_id', '')                         as seller_id,

    nullif(i->>'name', '')                              as name,
    nullif(i->>'name_alias', '')                        as name_alias,
    nullif(i->>'slug', '')                              as slug,
    nullif(i->>'url', '')                               as url,
    nullif(i->>'canonical_url', '')                     as canonical_url,
    nullif(i->>'short_description', '')                 as short_description,
    nullif(i->>'description', '')                       as description,
    case when i ? 'highlights'
         then array(select jsonb_array_elements_text(i->'highlights')) end as highlights,

    nullif(i->>'brand_raw', '')                         as brand_raw,
    nullif(i->>'manufacturer', '')                      as manufacturer,
    nullif(i->>'model', '')                             as model,
    nullif(i->>'color', '')                             as color,
    nullif(i->>'size', '')                              as size,
    nullif(i->>'material', '')                          as material,
    coalesce((i->>'condition')::find_your_prices.product_condition, 'new') as condition,
    coalesce((i->>'is_adult')::boolean, false)          as is_adult,

    (i->>'store_category_id')::uuid                     as store_category_id,
    nullif(i->>'category_raw', '')                      as category_raw,
    case when i ? 'category_path'
         then array(select jsonb_array_elements_text(i->'category_path')) end as category_path,
    case when i ? 'tags'
         then array(select jsonb_array_elements_text(i->'tags')) end as tags,

    coalesce(nullif(i->>'currency', ''), 'HNL')         as currency,
    (i->>'price')::numeric                              as price,
    (i->>'list_price')::numeric                         as list_price,
    (i->>'discount_percent')::numeric                   as discount_percent,
    (i->>'discount_amount')::numeric                    as discount_amount,
    (i->>'member_price')::numeric                       as member_price,
    (i->>'promo_price')::numeric                        as promo_price,
    (i->>'installment_price')::numeric                  as installment_price,
    (i->>'installment_count')::smallint                 as installment_count,
    (i->>'min_price')::numeric                          as min_price,
    (i->>'max_price')::numeric                          as max_price,
    (i->>'price_per_unit')::numeric                     as price_per_unit,
    nullif(i->>'unit_measure_code', '')                 as unit_measure_code,
    nullif(i->>'unit_measure_name', '')                 as unit_measure_name,
    (i->>'unit_amount')::numeric                        as unit_amount,
    (i->>'tax_rate')::numeric                           as tax_rate,
    coalesce((i->>'tax_included')::boolean, true)       as tax_included,
    (i->>'price_valid_until')::timestamptz              as price_valid_until,

    coalesce((i->>'availability')::find_your_prices.availability_status, 'unknown') as availability,
    (i->>'in_stock')::boolean                           as in_stock,
    (i->>'stock_quantity')::integer                     as stock_quantity,
    (i->>'min_order_quantity')::integer                 as min_order_quantity,
    (i->>'max_order_quantity')::integer                 as max_order_quantity,
    coalesce(i->'location_availability', '[]'::jsonb)   as location_availability,

    (i->>'rating_average')::numeric                     as rating_average,
    (i->>'rating_count')::integer                       as rating_count,
    (i->>'review_count')::integer                       as review_count,

    nullif(i->>'primary_image_url', '')                 as primary_image_url,
    case when i ? 'video_urls'
         then array(select jsonb_array_elements_text(i->'video_urls')) end as video_urls,

    (i->>'has_free_shipping')::boolean                  as has_free_shipping,
    (i->>'shipping_cost')::numeric                      as shipping_cost,
    coalesce(i->'shipping_info', '{}'::jsonb)           as shipping_info,
    (i->>'warranty_months')::smallint                   as warranty_months,
    coalesce(i->'warranty_info', '{}'::jsonb)           as warranty_info,
    (i->>'weight_grams')::numeric                       as weight_grams,
    (i->>'length_mm')::numeric                          as length_mm,
    (i->>'width_mm')::numeric                           as width_mm,
    (i->>'height_mm')::numeric                          as height_mm,

    coalesce(i->'specs', '{}'::jsonb)                   as specs,
    coalesce(i->'attributes', '{}'::jsonb)              as attributes,
    case when i ? 'badges'
         then array(select jsonb_array_elements_text(i->'badges')) end as badges,
    nullif(i->>'meta_title', '')                        as meta_title,
    nullif(i->>'meta_description', '')                  as meta_description,
    coalesce(i->'raw', '{}'::jsonb)                     as raw,

    -- Si el scraper no manda hash, se deriva del payload normalizado completo.
    coalesce(nullif(i->>'content_hash', ''), md5((i - 'content_hash')::text)) as content_hash,

    coalesce(i->'images', '[]'::jsonb)                  as images,
    coalesce(i->'variants', '[]'::jsonb)                as variants
  from jsonb_array_elements(p_items) i
  where nullif(i->>'external_id', '') is not null
    and nullif(i->>'name', '') is not null
    and nullif(i->>'url', '') is not null;

  create index on _incoming (external_id);
  select count(*) into v_found from _incoming;

  if v_found = 0 then
    return jsonb_build_object('items_found', 0, 'items_new', 0, 'items_updated', 0,
                              'items_unchanged', 0, 'price_changes', 0);
  end if;

  -- 2) Fotografiar el estado previo ANTES de escribir: sirve para saber que es
  --    nuevo, que cambio y para calcular el delta de precio.
  create temp table _before on commit drop as
  select sp.id, sp.external_id, sp.content_hash, sp.currency, sp.price, sp.list_price,
         sp.discount_percent, sp.member_price, sp.promo_price, sp.availability,
         sp.in_stock, sp.stock_quantity
  from find_your_prices.store_products sp
  join _incoming inc on inc.external_id = sp.external_id
  where sp.store_id = p_store_id;

  create index on _before (external_id);

  -- 3) Alta o actualizacion. La clausula WHERE del DO UPDATE evita reescribir
  --    filas identicas: en una corrida tipica la mayoria no cambio.
  create temp table _touched on commit drop as
  with upserted as (
    insert into find_your_prices.store_products as sp (
      store_id, external_id, external_code, sku, mpn, gtin, barcode_raw, ean, upc, isbn, asin,
      seller_name, seller_id, name, name_alias, slug, url, canonical_url, short_description,
      description, highlights, brand_raw, manufacturer, model, color, size, material, condition,
      is_adult, store_category_id, category_raw, category_path, tags, currency, price, list_price,
      discount_percent, discount_amount, member_price, promo_price, installment_price,
      installment_count, min_price, max_price, price_per_unit, unit_measure_code, unit_measure_name,
      unit_amount, tax_rate, tax_included, price_valid_until, availability, in_stock, stock_quantity,
      min_order_quantity, max_order_quantity, location_availability, rating_average, rating_count,
      review_count, primary_image_url, image_count, video_urls, has_free_shipping, shipping_cost,
      shipping_info, warranty_months, warranty_info, weight_grams, length_mm, width_mm, height_mm,
      specs, attributes, badges, meta_title, meta_description, raw, content_hash,
      first_seen_at, last_seen_at, last_scraped_at, last_scrape_run_id, is_active, delisted_at
    )
    select
      p_store_id, inc.external_id, inc.external_code, inc.sku, inc.mpn, inc.gtin, inc.barcode_raw,
      inc.ean, inc.upc, inc.isbn, inc.asin, inc.seller_name, inc.seller_id, inc.name, inc.name_alias,
      inc.slug, inc.url, inc.canonical_url, inc.short_description, inc.description, inc.highlights,
      inc.brand_raw, inc.manufacturer, inc.model, inc.color, inc.size, inc.material, inc.condition,
      inc.is_adult, inc.store_category_id, inc.category_raw, inc.category_path, inc.tags,
      inc.currency, inc.price, inc.list_price, inc.discount_percent, inc.discount_amount,
      inc.member_price, inc.promo_price, inc.installment_price, inc.installment_count,
      inc.min_price, inc.max_price, inc.price_per_unit, inc.unit_measure_code, inc.unit_measure_name,
      inc.unit_amount, inc.tax_rate, inc.tax_included, inc.price_valid_until, inc.availability,
      inc.in_stock, inc.stock_quantity, inc.min_order_quantity, inc.max_order_quantity,
      inc.location_availability, inc.rating_average, inc.rating_count, inc.review_count,
      inc.primary_image_url, jsonb_array_length(inc.images), inc.video_urls, inc.has_free_shipping,
      inc.shipping_cost, inc.shipping_info, inc.warranty_months, inc.warranty_info, inc.weight_grams,
      inc.length_mm, inc.width_mm, inc.height_mm, inc.specs, inc.attributes, inc.badges,
      inc.meta_title, inc.meta_description, inc.raw, inc.content_hash,
      v_now, v_now, v_now, p_run_id, true, null
    from _incoming inc
    on conflict (store_id, external_id) do update set
      external_code = excluded.external_code, sku = excluded.sku, mpn = excluded.mpn,
      gtin = excluded.gtin, barcode_raw = excluded.barcode_raw, ean = excluded.ean,
      upc = excluded.upc, isbn = excluded.isbn, asin = excluded.asin,
      seller_name = excluded.seller_name, seller_id = excluded.seller_id,
      name = excluded.name, name_alias = excluded.name_alias, slug = excluded.slug,
      url = excluded.url, canonical_url = excluded.canonical_url,
      short_description = excluded.short_description, description = excluded.description,
      highlights = excluded.highlights, brand_raw = excluded.brand_raw,
      manufacturer = excluded.manufacturer, model = excluded.model, color = excluded.color,
      size = excluded.size, material = excluded.material, condition = excluded.condition,
      is_adult = excluded.is_adult, store_category_id = excluded.store_category_id,
      category_raw = excluded.category_raw, category_path = excluded.category_path,
      tags = excluded.tags, currency = excluded.currency, price = excluded.price,
      list_price = excluded.list_price, discount_percent = excluded.discount_percent,
      discount_amount = excluded.discount_amount, member_price = excluded.member_price,
      promo_price = excluded.promo_price, installment_price = excluded.installment_price,
      installment_count = excluded.installment_count, min_price = excluded.min_price,
      max_price = excluded.max_price, price_per_unit = excluded.price_per_unit,
      unit_measure_code = excluded.unit_measure_code, unit_measure_name = excluded.unit_measure_name,
      unit_amount = excluded.unit_amount, tax_rate = excluded.tax_rate,
      tax_included = excluded.tax_included, price_valid_until = excluded.price_valid_until,
      availability = excluded.availability, in_stock = excluded.in_stock,
      stock_quantity = excluded.stock_quantity, min_order_quantity = excluded.min_order_quantity,
      max_order_quantity = excluded.max_order_quantity,
      location_availability = excluded.location_availability,
      rating_average = excluded.rating_average, rating_count = excluded.rating_count,
      review_count = excluded.review_count, primary_image_url = excluded.primary_image_url,
      image_count = excluded.image_count, video_urls = excluded.video_urls,
      has_free_shipping = excluded.has_free_shipping, shipping_cost = excluded.shipping_cost,
      shipping_info = excluded.shipping_info, warranty_months = excluded.warranty_months,
      warranty_info = excluded.warranty_info, weight_grams = excluded.weight_grams,
      length_mm = excluded.length_mm, width_mm = excluded.width_mm, height_mm = excluded.height_mm,
      specs = excluded.specs, attributes = excluded.attributes, badges = excluded.badges,
      meta_title = excluded.meta_title, meta_description = excluded.meta_description,
      raw = excluded.raw, content_hash = excluded.content_hash,
      last_seen_at = v_now, last_scraped_at = v_now, last_scrape_run_id = p_run_id,
      is_active = true, delisted_at = null,
      last_price_change_at = case
        when sp.price is distinct from excluded.price then v_now
        else sp.last_price_change_at
      end
    where sp.content_hash is distinct from excluded.content_hash
    returning sp.id, sp.external_id, (sp.first_seen_at = v_now) as is_new
  )
  select * from upserted;

  create index on _touched (external_id);

  select count(*) filter (where is_new), count(*) filter (where not is_new)
    into v_new, v_updated
  from _touched;

  -- 4) Los que no cambiaron: solo se refresca la marca de "sigue existiendo".
  update find_your_prices.store_products sp
  set last_seen_at = v_now,
      last_scraped_at = v_now,
      last_scrape_run_id = p_run_id,
      is_active = true,
      delisted_at = null
  from _incoming inc
  where sp.store_id = p_store_id
    and sp.external_id = inc.external_id
    and not exists (select 1 from _touched t where t.external_id = inc.external_id);

  get diagnostics v_unchanged = row_count;

  -- 5) Historico: una fila por cada cambio real de precio o disponibilidad.
  --    Los productos nuevos tambien entran, para tener su precio inicial.
  with changed as (
    select
      t.id as store_product_id,
      inc.currency, inc.price, inc.list_price, inc.discount_percent, inc.member_price,
      inc.promo_price, inc.availability, inc.in_stock, inc.stock_quantity,
      b.price as previous_price
    from _touched t
    join _incoming inc on inc.external_id = t.external_id
    left join _before b on b.external_id = t.external_id
    where b.id is null                                        -- producto nuevo
       or b.price            is distinct from inc.price
       or b.list_price       is distinct from inc.list_price
       or b.member_price     is distinct from inc.member_price
       or b.promo_price      is distinct from inc.promo_price
       or b.availability     is distinct from inc.availability
       or b.in_stock         is distinct from inc.in_stock
       or b.discount_percent is distinct from inc.discount_percent
  )
  insert into find_your_prices.price_history (
    store_product_id, store_id, scrape_run_id, currency, price, list_price, discount_percent,
    member_price, promo_price, availability, in_stock, stock_quantity,
    previous_price, price_delta, price_delta_pct, scraped_at
  )
  select
    c.store_product_id, p_store_id, p_run_id, c.currency, c.price, c.list_price, c.discount_percent,
    c.member_price, c.promo_price, c.availability, c.in_stock, c.stock_quantity,
    c.previous_price,
    case when c.previous_price is not null then c.price - c.previous_price end,
    case when c.previous_price is not null and c.previous_price <> 0
         then round(((c.price - c.previous_price) / c.previous_price) * 100, 2) end,
    v_now
  from changed c;

  get diagnostics v_price_changes = row_count;

  -- 6) Imagenes: se reemplaza la galeria de los productos que cambiaron.
  delete from find_your_prices.store_product_images img
  using _touched t
  where img.store_product_id = t.id;

  insert into find_your_prices.store_product_images
    (store_product_id, url, external_id, position, is_primary, alt_text, width, height)
  select
    t.id,
    im->>'url',
    nullif(im->>'external_id', ''),
    coalesce((im->>'position')::smallint, (ord - 1)::smallint),
    coalesce((im->>'is_primary')::boolean, ord = 1),
    nullif(im->>'alt_text', ''),
    (im->>'width')::integer,
    (im->>'height')::integer
  from _touched t
  join _incoming inc on inc.external_id = t.external_id
  cross join lateral jsonb_array_elements(inc.images) with ordinality as e(im, ord)
  where nullif(im->>'url', '') is not null
  -- El indice unico de imagenes es sobre md5(url) (se cambio por espacio):
  -- la expresion tiene que coincidir exactamente o Postgres no lo encuentra.
  on conflict (store_product_id, md5(url)) do nothing;

  -- 7) Variantes: mismo criterio, upsert por external_id de variante.
  insert into find_your_prices.store_product_variants (
    store_product_id, external_id, sku, gtin, barcode_raw, name, color, size, capacity,
    options, currency, price, list_price, availability, in_stock, stock_quantity, image_url,
    raw, is_active, last_seen_at
  )
  select
    t.id,
    v->>'external_id',
    nullif(v->>'sku', ''),
    find_your_prices.to_gtin14(v->>'barcode_raw'),
    nullif(v->>'barcode_raw', ''),
    nullif(v->>'name', ''),
    nullif(v->>'color', ''),
    nullif(v->>'size', ''),
    nullif(v->>'capacity', ''),
    coalesce(v->'options', '{}'::jsonb),
    nullif(v->>'currency', ''),
    (v->>'price')::numeric,
    (v->>'list_price')::numeric,
    coalesce((v->>'availability')::find_your_prices.availability_status, 'unknown'),
    (v->>'in_stock')::boolean,
    (v->>'stock_quantity')::integer,
    nullif(v->>'image_url', ''),
    v,
    true,
    v_now
  from _touched t
  join _incoming inc on inc.external_id = t.external_id
  cross join lateral jsonb_array_elements(inc.variants) as v
  where nullif(v->>'external_id', '') is not null
  on conflict (store_product_id, external_id) do update set
    sku = excluded.sku, gtin = excluded.gtin, barcode_raw = excluded.barcode_raw,
    name = excluded.name, color = excluded.color, size = excluded.size,
    capacity = excluded.capacity, options = excluded.options, currency = excluded.currency,
    price = excluded.price, list_price = excluded.list_price,
    availability = excluded.availability, in_stock = excluded.in_stock,
    stock_quantity = excluded.stock_quantity, image_url = excluded.image_url,
    raw = excluded.raw, is_active = true, last_seen_at = v_now;

  drop table if exists _incoming;
  drop table if exists _before;
  drop table if exists _touched;

  return jsonb_build_object(
    'items_found',     v_found,
    'items_new',       v_new,
    'items_updated',   v_updated,
    'items_unchanged', v_unchanged,
    'price_changes',   v_price_changes
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- mark_delisted_products: marca como inactivos los articulos que dejaron de
-- aparecer. Se llama al cerrar un run de catalogo completo, nunca despues de
-- scrapear una sola categoria (borraria el resto de la tienda).
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.mark_delisted_products(
  p_store_id uuid,
  p_run_id   uuid,
  p_scope_store_category_id uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update find_your_prices.store_products sp
  set is_active = false,
      delisted_at = now(),
      availability = 'discontinued'
  where sp.store_id = p_store_id
    and sp.is_active
    and sp.last_scrape_run_id is distinct from p_run_id
    and (p_scope_store_category_id is null or sp.store_category_id = p_scope_store_category_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function find_your_prices.ingest_store_products(uuid, uuid, jsonb) is
  'Ingesta transaccional de un lote de productos: upsert, deteccion de cambios por hash, historico de precios, imagenes y variantes.';
comment on function find_your_prices.mark_delisted_products(uuid, uuid, uuid) is
  'Desactiva articulos no vistos en el ultimo run. Usar solo tras un barrido de catalogo completo.';
