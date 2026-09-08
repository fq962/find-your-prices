-- =============================================================================
-- 0013_catalog_facets.sql
-- Facetas del catálogo: las opciones de filtro que de verdad devuelven algo.
--
-- EL PROBLEMA QUE RESUELVE
-- ---------------------------------------------------------------------------
-- El filtro de categorías se estaba armando con el árbol completo de la tienda
-- (`store_categories`), que en Diunsa son 266 nodos. Pero cada artículo carga
-- exactamente UN materialGroupCode, y siempre es una hoja: los nodos padre y
-- los de navegación o campaña ("Todos", "Tecnología", "Invierte tu 14avo",
-- "Lego") no tienen ni un producto asignado.
--
-- Resultado medido: 204 de las 266 categorías del selector devolvían cero
-- resultados. El usuario elegía una categoría que el sitio le ofrecía y la
-- lista quedaba vacía, sin explicación posible.
--
-- La corrección es de fondo, no un parche en el front: las facetas se derivan
-- de los productos que existen, no del árbol que publica la tienda. Y de paso
-- se entrega el conteo, para poder mostrar cuántos artículos hay detrás de
-- cada opción antes de elegirla.
--
-- Se resuelve en Postgres porque PostgREST devuelve como mucho 1000 filas por
-- petición: contar 8000 productos desde la app serían nueve viajes por cada
-- render.
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
  and sp.price is not null
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
  and sp.price is not null
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
  and sp.price is not null
  and coalesce(b.name, sp.brand_raw) is not null
group by coalesce(b.name, sp.brand_raw)
having count(*) >= 2;

-- -----------------------------------------------------------------------------
-- Resumen global: alimenta el rango del control de precio y los contadores.
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
  and sp.price is not null;

-- -----------------------------------------------------------------------------
-- security_invoker: sin esto la vista se evaluaría con los permisos de su
-- dueño y saltaría el RLS de las tablas que consulta. Mismo criterio que la
-- migración 0012; hay que repetirlo en cada vista nueva.
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
    ]
    loop
      execute format('alter view find_your_prices.%I set (security_invoker = true)', v);
    end loop;
  end if;
end
$$;

grant select on
  find_your_prices.v_catalog_category_facets,
  find_your_prices.v_catalog_store_facets,
  find_your_prices.v_catalog_brand_facets,
  find_your_prices.v_catalog_summary
to anon, authenticated;

comment on view find_your_prices.v_catalog_category_facets is
  'Categorías con al menos un artículo activo, con conteo y rango de precio. Es la fuente del filtro: usar store_categories llenaría el selector de opciones vacías.';
comment on view find_your_prices.v_catalog_store_facets is 'Tiendas con oferta viva, con conteo y rango de precio.';
comment on view find_your_prices.v_catalog_brand_facets is 'Marcas con dos o más artículos activos.';
comment on view find_your_prices.v_catalog_summary is 'Totales y rango de precio del catálogo. Alimenta el control de precio y los contadores.';
