-- =============================================================================
-- 0017_seed_walmart.sql
-- Alta de Walmart Honduras y de sus targets iniciales.
--
-- www.walmart.com.hn corre sobre VTEX. La estrategia 'walmarthn' consume la
-- Catalog System API publica (sin token) en vez de parsear html:
--
--   GET /api/catalog_system/pub/products/search/{ruta}?_from=N&_to=M&O=...
--
-- Dos cosas que condicionan la configuracion de abajo:
--
--   1. Solo ese endpoint acepta nuestro user agent. `category/tree` y
--      `facets/search` responden 429 con `rate-limit-reason: bot`. Por eso la
--      jerarquia se arma con lo que trae cada producto y las subcategorias
--      salen del sitemap, que si acepta al bot. No se cambia el user agent
--      para forzar esas puertas.
--
--   2. La API entrega como maximo 2550 articulos por consulta (ventana de 50 y
--      `_from` tope 2500). Abarrotes (2469) e Higiene y Belleza (2410) caben;
--      Articulos para el hogar (4430) no, y la estrategia lo reparte solo
--      entre sus 14 subcategorias. Barrido verificado el 2026-09-09:
--      2469/2469, 2410/2410 y 4430/4430 articulos, sin errores.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'walmarthn',
  'Walmart Honduras',
  'https://www.walmart.com.hn',
  'HN',
  'HNL',
  'es-HN',
  'walmarthn',
  jsonb_build_object(
    'apiBaseUrl', 'https://www.walmart.com.hn/api/catalog_system/pub',
    'webBaseUrl', 'https://www.walmart.com.hn',
    -- Maximo real: el ancho de la ventana _from/_to. Con 51 responde 400.
    'pageSize', 50,
    -- Orden explicito: sin el, VTEX ordena por relevancia y un articulo puede
    -- colarse entre dos paginas.
    'orderBy', 'OrderByNameASC',
    'partitionOversized', true,
    'syncCategories', true
  ),
  400,
  1,
  true,
  'Catalog System API publica de VTEX. Solo products/search acepta al bot: category/tree y facets/search responden 429 con rate-limit-reason: bot. Tope de 2550 articulos por consulta; las categorias mas grandes se reparten por subcategorias del sitemap.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Targets iniciales: las tres categorias pedidas.
--
-- No hay target de catalogo completo a proposito. Con 400 ms de cortesia, solo
-- estas tres ya son ~250 peticiones (~4 min) y el runner aborta a los 240 s.
-- El catalogo entero se cubre agregando targets por departamento, no de un solo
-- golpe; y mientras ningun target sea 'full_catalog', el runner no marca
-- productos como retirados, que es lo correcto con barridos parciales.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'walmarthn')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select s.id, v.name, v.kind, v.url, v.config, v.frequency_minutes, v.max_pages, v.priority, v.is_active, v.notes
from s
cross join (values
  (
    'Walmart HN - Abarrotes',
    'category'::find_your_prices.scrape_target_kind,
    'https://www.walmart.com.hn/abarrotes',
    jsonb_build_object('categoryPath', 'abarrotes'),
    720,      -- dos veces al dia
    60,
    20::smallint,
    true,
    '2469 articulos en 50 peticiones (~58 s). Cabe entero en una consulta, sin reparto.'
  ),
  (
    'Walmart HN - Higiene y Belleza',
    'category'::find_your_prices.scrape_target_kind,
    'https://www.walmart.com.hn/higiene-y-belleza',
    jsonb_build_object('categoryPath', 'higiene-y-belleza'),
    720,
    60,
    20::smallint,
    true,
    '2410 articulos en 49 peticiones (~59 s). Cabe entero en una consulta, sin reparto.'
  ),
  (
    'Walmart HN - Articulos para el hogar',
    'category'::find_your_prices.scrape_target_kind,
    'https://www.walmart.com.hn/articulos-para-el-hogar',
    jsonb_build_object('categoryPath', 'articulos-para-el-hogar', 'partitionOversized', true),
    1440,     -- una vez al dia: es el mas pesado de los tres
    200,
    30::smallint,
    true,
    '4430 articulos que NO caben en una consulta: la estrategia los reparte entre las 14 subcategorias del sitemap. 147 peticiones (~126 s), dentro del presupuesto de 240 s del runner pero sin mucho margen. Si empieza a abortar, dividirlo en targets por subcategoria.'
  )
) as v(name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes)
-- El indice scrape_targets_store_url_key es PARCIAL (where url is not null).
-- Postgres exige repetir ese predicado aqui para poder usarlo como arbitro del
-- on conflict; sin el falla con "no unique or exclusion constraint matching".
on conflict (store_id, url) where url is not null do update set
  name = excluded.name,
  kind = excluded.kind,
  config = excluded.config,
  frequency_minutes = excluded.frequency_minutes,
  max_pages = excluded.max_pages,
  priority = excluded.priority,
  notes = excluded.notes,
  updated_at = now();
