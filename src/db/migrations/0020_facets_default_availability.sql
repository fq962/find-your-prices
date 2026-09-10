-- =============================================================================
-- 0020_facets_default_availability.sql
-- Las facetas cuentan lo mismo que el catálogo muestra por defecto.
--
-- EL PROBLEMA QUE RESUELVE
-- ---------------------------------------------------------------------------
-- El catálogo pasó a ocultar, salvo que alguien pida lo contrario, dos cosas
-- que no se pueden comprar hoy: los artículos agotados o descontinuados, y los
-- que tienen precio 0 —que no son una ganga, son un precio que la tienda no
-- publicó y que el scraper anotó como cero.
--
-- Las vistas de faceta de la migración 0013 seguían contándolos. Eso reabre
-- exactamente el bug que 0013 vino a cerrar, sólo que más difícil de ver: el
-- selector ofrece "Televisores (120)", la persona la elige y aparecen 90.
-- Nadie reporta eso como error; simplemente el sitio se siente poco confiable.
--
-- La condición que se agrega es la misma que aplica `applyAvailabilityFloor`
-- en server/services/catalog.ts. Si una cambia, la otra tiene que cambiar.
--
-- NOTA sobre `unknown`: no se excluye a propósito. Cuando el scraper no logró
-- determinar la existencia, esconder el artículo sería tratar un vacío de
-- información como una negativa, y dejaría fuera miles de artículos que sí
-- están a la venta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorías que realmente tienen oferta viva, con su conteo y rango de precio.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_category_facets as
select
  sc.id                       as store_category_id,
  sc.name                     as category_name,
  sc.external_id              as category_external_id,
  s.id                        as store_id,
  s.slug                      as store_slug,
  s.name                      as store_name,
  c.slug                      as canonical_slug,
  count(*)                    as product_count,
  count(*) filter (where sp.list_price is not null) as discounted_count,
  min(sp.price)               as min_price,
  max(sp.price)               as max_price
from find_your_prices.store_products sp
join find_your_prices.stores s            on s.id = sp.store_id
join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c   on c.id = sc.category_id
where sp.is_active
  and s.is_active
  and sp.price > 0
  and sp.availability not in ('out_of_stock', 'discontinued')
group by sc.id, sc.name, sc.external_id, s.id, s.slug, s.name, c.slug;

-- -----------------------------------------------------------------------------
-- Tiendas con oferta viva.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_store_facets as
select
  s.id                        as store_id,
  s.slug                      as store_slug,
  s.name                      as store_name,
  s.logo_url,
  count(*)                    as product_count,
  count(*) filter (where sp.list_price is not null) as discounted_count,
  min(sp.price)               as min_price,
  max(sp.price)               as max_price
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
where sp.is_active
  and s.is_active
  and sp.price > 0
  and sp.availability not in ('out_of_stock', 'discontinued')
group by s.id, s.slug, s.name, s.logo_url;

-- -----------------------------------------------------------------------------
-- Marcas con oferta viva. Se acota a las que tienen al menos dos artículos:
-- con 3000 marcas de un solo producto el selector sería inservible.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_brand_facets as
select
  coalesce(b.name, sp.brand_raw) as brand_name,
  count(*)                       as product_count,
  min(sp.price)                  as min_price,
  max(sp.price)                  as max_price
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
where sp.is_active
  and s.is_active
  and sp.price > 0
  and sp.availability not in ('out_of_stock', 'discontinued')
  and coalesce(b.name, sp.brand_raw) is not null
group by coalesce(b.name, sp.brand_raw)
having count(*) >= 2;

-- -----------------------------------------------------------------------------
-- Resumen global: alimenta el rango del control de precio y los contadores.
--
-- `total_products` pasa a significar "artículos comprables hoy", que es lo que
-- la portada dice en voz alta ("N productos"). Contar ahí lo que el catálogo no
-- muestra sería publicar una cifra que nadie puede verificar navegando.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_summary as
select
  count(*)                                          as total_products,
  count(distinct sp.store_id)                       as total_stores,
  count(distinct sp.store_category_id)              as total_categories,
  count(*) filter (where sp.list_price is not null) as discounted_products,
  count(*) filter (where sp.in_stock)               as in_stock_products,
  min(sp.price)                                     as min_price,
  max(sp.price)                                     as max_price,
  max(sp.last_seen_at)                              as last_seen_at
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
where sp.is_active
  and s.is_active
  and sp.price > 0
  and sp.availability not in ('out_of_stock', 'discontinued');

-- -----------------------------------------------------------------------------
-- security_invoker: sin esto la vista se evaluaría con los permisos de su
-- dueño y saltaría el RLS de las tablas que consulta. `create or replace view`
-- conserva las opciones existentes, pero se repite por si alguna vista se
-- recreó desde cero en el camino.
-- -----------------------------------------------------------------------------
do $$
declare
  v text;
begin
  if current_setting('server_version_num')::integer >= 150000 then
    foreach v in array array[
      'v_catalog_category_facets',
      'v_catalog_store_facets',
      'v_catalog_brand_facets',
      'v_catalog_summary'
    ] loop
      execute format('alter view find_your_prices.%I set (security_invoker = on)', v);
    end loop;
  end if;
end $$;
