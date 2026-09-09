-- =============================================================================
-- 0014_seed_jetstereo.sql
-- Alta de la tienda Jetstereo y de sus targets iniciales.
--
-- jetstereo.com corre sobre Next.js con render en servidor, pero la grilla de
-- productos la pinta el navegador contra un motor de busqueda propio (Elastic
-- App Search). Por eso la estrategia 'jetstereo' consume ese motor
-- directamente en vez de parsear html: la pagina de categoria que devuelve el
-- servidor no trae ningun producto de la grilla principal.
--
-- El indice mezcla productos con paginas de marca+categoria para SEO; se
-- filtra por sale_status in [AVAILABLE, OUT_OF_STOCK] para quedarse solo con
-- los articulos reales (~5618 de 9661 documentos totales).
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'jetstereo',
  'Jetstereo',
  'https://www.jetstereo.com',
  'HN',
  'HNL',
  'es-HN',
  'jetstereo',
  jsonb_build_object(
    'engineUrl', 'https://jetstereo-search-engine.ent.us-west-1.aws.found.io/api/as/v1/engines/jetstereo-main-engine',
    -- Clave de busqueda publica de Elastic App Search (prefijo "search-"):
    -- esta hecha para ir en codigo cliente, se encontro tal cual en el bundle
    -- de jetstereo.com.
    'searchKey', 'search-5t4ro38vq5xc6femwcezfixr',
    'webBaseUrl', 'https://www.jetstereo.com',
    -- El motor acepta hasta size=1000 por request; 1001 devuelve 400.
    'pageSize', 1000
  ),
  400,
  2,
  true,
  'Motor de busqueda Elastic App Search detectado en el bundle del sitio. query vacio + filtro de sale_status trae el catalogo completo.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Targets iniciales.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'jetstereo')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, priority, is_active, notes
)
select s.id, v.name, v.kind, v.url, v.config, v.frequency_minutes, v.priority, v.is_active, v.notes
from s
cross join (values
  (
    'Jetstereo - Catalogo completo',
    'full_catalog'::find_your_prices.scrape_target_kind,
    'https://www.jetstereo.com/',
    jsonb_build_object('includeOutOfStock', true, 'syncCategories', true, 'markDelisted', true),
    720,      -- dos veces al dia
    10::smallint,
    true,
    'Barrido completo (~5618 articulos reales, 6 requests a 1000 por pagina). Unico target autorizado a marcar productos como delisted.'
  ),
  (
    'Jetstereo - Celulares y Accesorios',
    'category'::find_your_prices.scrape_target_kind,
    'https://www.jetstereo.com/category/celulares',
    jsonb_build_object('mainCategory', 'Celulares y Accesorios', 'includeOutOfStock', true, 'syncCategories', false),
    360,      -- cada 6 horas
    50::smallint,
    true,
    'Categoria de ejemplo. mainCategory debe coincidir exacto con el facet main_category del motor (~1300 articulos).'
  )
) as v(name, kind, url, config, frequency_minutes, priority, is_active, notes)
-- El indice scrape_targets_store_url_key es PARCIAL (where url is not null).
-- Postgres exige repetir ese predicado aqui para poder usarlo como arbitro del
-- on conflict; sin el falla con "no unique or exclusion constraint matching".
on conflict (store_id, url) where url is not null do update set
  name = excluded.name,
  kind = excluded.kind,
  config = excluded.config,
  frequency_minutes = excluded.frequency_minutes,
  priority = excluded.priority,
  notes = excluded.notes,
  updated_at = now();
