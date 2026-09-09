-- =============================================================================
-- 0016_seed_acosa.sql
-- Alta de la tienda ACOSA y de sus targets iniciales.
--
-- acosa.com.hn es WordPress + WooCommerce. Expone la "Store API" de
-- WooCommerce sin autenticacion (la misma que usa el tema para el carrito por
-- bloques), remapeada de /wp-json/ a /API/ en este sitio. La estrategia
-- 'acosa' la consume directo en vez de parsear html.
--
-- El sitio tiene un portal de verificacion propio ("Bluexpace"): sin la
-- cookie bxVer=1, cualquier request (html o API) redirige a bxVerify.html.
-- No hay puzzle que resolver, solo mandar esa cookie desde el arranque.
--
-- La respuesta JSON trae un BOM UTF-8 al inicio que JSON.parse no tolera: la
-- estrategia lo recorta antes de parsear (ver comentarios en acosa.ts).
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'acosa',
  'ACOSA',
  'https://acosa.com.hn',
  'HN',
  'HNL',
  'es-HN',
  'acosa',
  jsonb_build_object(
    'apiBaseUrl', 'https://acosa.com.hn/API/wc/store/v1',
    'webBaseUrl', 'https://acosa.com.hn',
    -- La Store API SI avisa si te pasas: 101 responde 400 explicito.
    'pageSize', 100
  ),
  300,
  2,
  true,
  'Store API publica de WooCommerce (remapeada a /API/ en este sitio). Requiere la cookie bxVer=1 del portal de verificacion propio del sitio; sin eso, 302 a bxVerify.html.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Targets iniciales.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'acosa')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, priority, is_active, notes
)
select s.id, v.name, v.kind, v.url, v.config, v.frequency_minutes, v.priority, v.is_active, v.notes
from s
cross join (values
  (
    'ACOSA - Catalogo completo',
    'full_catalog'::find_your_prices.scrape_target_kind,
    'https://acosa.com.hn/shop/',
    jsonb_build_object('syncCategories', true, 'markDelisted', true),
    720,      -- dos veces al dia
    10::smallint,
    true,
    'Barrido completo (~9468 articulos, ~95 requests a 100 por pagina). Unico target autorizado a marcar productos como delisted.'
  ),
  (
    'ACOSA - Cables de red',
    'category'::find_your_prices.scrape_target_kind,
    'https://acosa.com.hn/product-category/tecnologia/tecnologia-red-e-infraestructura/tecnologia-red-e-infraestructura-cables-de-red/',
    jsonb_build_object('categoryId', '16442', 'syncCategories', false),
    360,      -- cada 6 horas
    50::smallint,
    true,
    'Categoria de ejemplo. categoryId es el id numerico de WooCommerce, no el slug.'
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
