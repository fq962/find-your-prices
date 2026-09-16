-- =============================================================================
-- 0032_seed_pcbuilds.sql
-- Alta de PC Builds Honduras (componentes de computadora,
-- https://www.pcbuildshonduras.com) y de un target de catalogo completo.
--
-- El sitio corre sobre Odoo eCommerce (website_sale). Medido el 2026-09-16:
--
--   1. El html de /shop es SSR real: la tarjeta trae nombre, precio, imagen,
--      enlace y los ids de Odoo (product.template y product.product). No hay
--      JSON publico para anonimos, asi que se parsea la tarjeta.
--   2. 15 por pagina, fijo (?ppg= se ignora). 222 productos en 15 paginas.
--   3. La tarjeta no dice la categoria. La barra lateral trae el arbol (41
--      categorias) y un listado de categoria incluye a sus hijas: la
--      estrategia recorre las categorias de la hoja a la raiz, se queda con
--      la primera aparicion y al final barre /shop. Son ~60 peticiones,
--      ~40 s con 500 ms de cortesia: cabe en una corrida.
--   4. Como el barrido cubre todo el catalogo, este target SI da de baja lo
--      retirado (full_catalog).
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'pcbuilds',
  'PC Builds Honduras',
  'https://www.pcbuildshonduras.com',
  'HN',
  'HNL',
  'es-HN',
  'pcbuilds',
  jsonb_build_object('webBaseUrl', 'https://www.pcbuildshonduras.com'),
  500,
  1,
  true,
  'Odoo eCommerce con html SSR; se parsean las tarjetas de /shop y de cada '
  || 'categoria (41). 222 productos en 15 paginas de 15. Url canonica '
  || '/shop/{slug}-{templateId}; en listados de categoria el href lleva ademas '
  || 'el segmento de la categoria y la estrategia lo recorta. La tarjeta no '
  || 'publica stock: solo se marca preventa por la categoria "Productos en Camino".'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  notes = excluded.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Un solo target: el catalogo entero cabe en una corrida.
-- max_pages cuenta peticiones totales (categorias + paginas + /shop); el
-- barrido medido usa ~60, el tope deja margen para que la tienda crezca.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'pcbuilds')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'PC Builds - Catalogo completo',
  'full_catalog'::find_your_prices.scrape_target_kind,
  'https://www.pcbuildshonduras.com/shop',
  jsonb_build_object('markDelisted', true),
  720,      -- dos veces al dia
  150,
  20::smallint,
  true,
  'Barrido completo (~222 articulos, ~60 peticiones medidas el 2026-09-16). Unico target autorizado a marcar productos como delisted.'
from s
-- El indice scrape_targets_store_url_key es PARCIAL (where url is not null):
-- hay que repetir el predicado para que Postgres lo acepte como arbitro.
on conflict (store_id, url) where url is not null do update set
  name = excluded.name,
  kind = excluded.kind,
  config = excluded.config,
  frequency_minutes = excluded.frequency_minutes,
  max_pages = excluded.max_pages,
  priority = excluded.priority,
  is_active = excluded.is_active,
  notes = excluded.notes,
  updated_at = now();
