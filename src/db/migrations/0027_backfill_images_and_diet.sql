-- =============================================================================
-- 0027_backfill_images_and_diet.sql
-- Backfill por lotes para 0026. Requiere 0026 aplicada.
--
-- Cada fila de store_products que se reescribe recalcula normalized_name
-- (columna generada) y toca todos los indices; hacerlo de una vez sobre 74k
-- filas revienta el statement_timeout del editor. Este UPDATE procesa hasta
-- 5 000 filas y solo elige las que todavia tienen algo pendiente, asi que:
--
--   >>> EJECUTAR REPETIDAMENTE HASTA QUE DEVUELVA "UPDATE 0". <<<
--
-- Con 74k productos son ~15 pasadas. Es seguro reintentarlo, cortarlo a medias
-- y volver a correrlo; el scraper puede seguir corriendo mientras tanto.
--
-- Por fila, en una sola escritura:
--   * images       <- galeria de store_product_images (primaria primero, max 6)
--   * image_count  <- total real de imagenes que tenia
--   * raw          <- '{}'
--   * description  <- sin HTML, espacios colapsados, max 2 000 caracteres
-- =============================================================================

with batch as (
  select sp.id
  from find_your_prices.store_products sp
  where (
          sp.images = '[]'::jsonb
          and exists (select 1 from find_your_prices.store_product_images i
                      where i.store_product_id = sp.id)
        )
     or sp.raw is null or sp.raw <> '{}'::jsonb
     or sp.description ~ '<[^>]+>'
     or length(sp.description) > 2000
  limit 5000
),
gallery as (
  select store_product_id,
         jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object('url', url, 'alt', alt_text))
           order by is_primary desc, position, created_at
         ) filter (where rn <= 6) as images,
         count(*)                  as n
  from (
    select i.*,
           row_number() over (
             partition by i.store_product_id
             order by i.is_primary desc, i.position, i.created_at
           ) as rn
    from find_your_prices.store_product_images i
    where i.store_product_id in (select id from batch)
  ) ranked
  group by store_product_id
)
update find_your_prices.store_products sp
set images      = case when sp.images = '[]'::jsonb
                       then coalesce(g.images, '[]'::jsonb) else sp.images end,
    image_count = case when sp.images = '[]'::jsonb and g.n is not null
                       then g.n else sp.image_count end,
    raw         = '{}'::jsonb,
    description = nullif(left(btrim(regexp_replace(
                    regexp_replace(coalesce(sp.description, ''), '<[^>]*>', ' ', 'g'),
                    '\s+', ' ', 'g')), 2000), '')
from batch b
left join gallery g on g.store_product_id = b.id
where sp.id = b.id;

-- Para ver cuanto falta:
-- select count(*) from find_your_prices.store_products sp
-- where (sp.images = '[]'::jsonb and exists (select 1 from find_your_prices.store_product_images i where i.store_product_id = sp.id))
--    or sp.raw <> '{}'::jsonb or sp.description ~ '<[^>]+>' or length(sp.description) > 2000;
