-- =============================================================================
-- 0024_canonical_category_facets.sql
-- El filtro de categorías pasa a usar el árbol propio (`categories`), no el de
-- cada tienda.
--
-- EL PROBLEMA QUE RESUELVE
-- ---------------------------------------------------------------------------
-- Cada tienda publica su propio árbol, y entre siete tiendas hay "Juguetes",
-- "Juguetería" y "Juguetes para jugar" como categorías distintas. El selector
-- ofrecía las tres, cada una con sus artículos, y elegir una escondía las
-- otras dos. La tabla `categories` existe justamente para normalizar eso:
-- `store_categories.category_id` apunta al nodo canónico y es lo que decide
-- en qué categoría se ve un artículo.
--
-- Esto es SOLO visualización y filtrado. El scraper sigue guardando
-- `store_category_id` tal cual, y `store_categories` sigue siendo la llave de
-- paginación: nada de eso cambia acá.
--
-- El mapeo no está completo (hay `category_id` en null y artículos sin
-- `store_category_id`). Esos artículos no desaparecen: caen en una categoría
-- sintética al final del selector, "Sin categorizar aún", que el servicio
-- identifica porque `category_slug` viene null.
--
-- El árbol canónico tiene dos niveles (raíz e hija). `category_root_*` se
-- calcula con esa premisa: el padre de una hija es la raíz, y una raíz es su
-- propia raíz. Si algún día hay un tercer nivel, hay que cambiar el join por
-- una consulta recursiva sobre `path`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Publicar el nombre canónico y la raíz en la vista del catálogo.
--
-- Al final de la lista, como en 0017 y 0021: `create or replace view` solo
-- admite columnas nuevas al final. `category_slug` ya existía desde 0009.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_store_products_current as
select
  sp.id,
  sp.store_id,
  s.slug            as store_slug,
  s.name            as store_name,
  s.logo_url        as store_logo_url,
  sp.product_id,
  sp.external_id,
  sp.name,
  sp.url,
  sp.primary_image_url,
  coalesce(b.name, sp.brand_raw) as brand,
  sp.category_raw,
  sc.name           as store_category_name,
  c.slug            as category_slug,
  sp.currency,
  sp.price,
  sp.list_price,
  sp.discount_percent,
  sp.member_price,
  sp.availability,
  sp.in_stock,
  sp.stock_quantity,
  sp.rating_average,
  sp.rating_count,
  sp.gtin,
  sp.last_seen_at,
  sp.last_price_change_at,
  sp.first_seen_at,
  sp.public_slug,
  c.name            as category_name,
  cr.slug           as category_root_slug,
  cr.name           as category_root_name
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
left join find_your_prices.categories cr on cr.id = coalesce(c.parent_id, c.id)
where sp.is_active and s.is_active;

comment on view find_your_prices.v_store_products_current is
  'Oferta activa con tienda, marca y categoria canonica resueltas. Base del catalogo publico.';

-- -----------------------------------------------------------------------------
-- Facetas por categoría canónica.
--
-- Una fila por nodo canónico con al menos un artículo comprable hoy, más UNA
-- fila con `category_id` null que agrupa todo lo que aún no tiene mapeo. El
-- `left join` a `store_categories` es deliberado: un artículo sin
-- `store_category_id` también cuenta como "sin categorizar", no se pierde.
--
-- El conteo es directo (artículos apuntando a ESE nodo). El total de una raíz
-- —lo suyo más lo de sus hijas— lo suma el servicio al armar el árbol, que
-- es más barato que un `group by rollup` y deja la fila lista para pintar.
--
-- Mismo piso de disponibilidad que 0020: lo que se ofrece en el selector tiene
-- que ser lo que el listado devuelve.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_canonical_category_facets as
select
  c.id                        as category_id,
  c.slug                      as slug,
  c.name                      as name,
  c.level                     as level,
  c.position                  as position,
  p.id                        as parent_id,
  p.slug                      as parent_slug,
  p.name                      as parent_name,
  p.position                  as parent_position,
  count(*)                    as product_count,
  count(*) filter (where sp.list_price is not null) as discounted_count,
  min(sp.price)               as min_price,
  max(sp.price)               as max_price
from find_your_prices.store_products sp
join find_your_prices.stores s            on s.id = sp.store_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c   on c.id = sc.category_id
left join find_your_prices.categories p   on p.id = c.parent_id
where sp.is_active
  and s.is_active
  and sp.price > 0
  and sp.availability not in ('out_of_stock', 'discontinued')
group by c.id, c.slug, c.name, c.level, c.position, p.id, p.slug, p.name, p.position;

comment on view find_your_prices.v_catalog_canonical_category_facets is
  'Categorias canonicas (tabla categories) con al menos un articulo comprable, con conteo directo. La fila con category_id null es "sin categorizar aun". Fuente del filtro de categorias.';

-- -----------------------------------------------------------------------------
-- `total_categories` pasa a contar nodos canónicos, no nodos de tienda: es la
-- cifra que la portada anuncia junto al selector, y tiene que coincidir con lo
-- que el selector ofrece. Misma lista de columnas y tipos que 0020, así que
-- `create or replace` la reemplaza sin soltar nada.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_summary as
select
  count(*)                                          as total_products,
  count(distinct sp.store_id)                       as total_stores,
  count(distinct sc.category_id)                    as total_categories,
  count(*) filter (where sp.list_price is not null) as discounted_products,
  count(*) filter (where sp.in_stock)               as in_stock_products,
  min(sp.price)                                     as min_price,
  max(sp.price)                                     as max_price,
  max(sp.last_seen_at)                              as last_seen_at
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
where sp.is_active
  and s.is_active
  and sp.price > 0
  and sp.availability not in ('out_of_stock', 'discontinued');

-- -----------------------------------------------------------------------------
-- security_invoker y grant, como en 0013 y 0020. Se repite para
-- v_store_products_current y v_catalog_summary por si alguna se recreó desde
-- cero en el camino.
-- -----------------------------------------------------------------------------
do $$
declare
  v text;
begin
  if current_setting('server_version_num')::integer >= 150000 then
    foreach v in array array[
      'v_store_products_current',
      'v_catalog_canonical_category_facets',
      'v_catalog_summary'
    ] loop
      execute format('alter view find_your_prices.%I set (security_invoker = on)', v);
    end loop;
  end if;
end $$;

grant select on
  find_your_prices.v_catalog_canonical_category_facets
to anon, authenticated;
