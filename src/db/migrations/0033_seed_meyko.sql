-- =============================================================================
-- 0033_seed_meyko.sql
-- Alta de Meyko (insumos medicos y cuidado en casa, https://meyko.com) y de un
-- target de catalogo completo.
--
-- El sitio corre sobre Odoo eCommerce v15. Medido el 2026-09-17:
--
--   1. El html de /shop es SSR real con microdatos schema.org por tarjeta
--      (precio numerico, moneda, url, imagen) y los ids de Odoo. No hay JSON
--      publico para anonimos.
--   2. `?ppg=` se honra: ppg=1000 trae las 845 tarjetas en una pagina de 3 MB.
--      Se usa 500 para no depender de un solo request enorme.
--   3. La tarjeta no dice categoria. La barra lateral trae el arbol (46) y un
--      listado de categoria incluye a sus hijas: la estrategia recorre de la
--      hoja a la raiz, se queda con la primera aparicion y al final barre
--      /shop. Son ~48 peticiones, ~45 s con 300 ms de cortesia.
--   4. 18 articulos publican precio 0.0: se guardan sin precio.
--   5. El barrido cubre todo el catalogo: este target da de baja lo retirado.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'meyko',
  'Meyko',
  'https://meyko.com',
  'HN',
  'HNL',
  'es-HN',
  'meyko',
  jsonb_build_object('webBaseUrl', 'https://meyko.com', 'pageSize', 500),
  300,
  1,
  true,
  'Odoo eCommerce v15 con html SSR y microdatos; ?ppg= honrado (500 por pagina). '
  || '845 productos en 46 categorias. Url canonica /shop/{slug}-{templateId}. '
  || 'La tarjeta no publica stock. Precios 0.0 se guardan sin precio.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  notes = excluded.notes,
  updated_at = now();

with s as (select id from find_your_prices.stores where slug = 'meyko')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Meyko - Catalogo completo',
  'full_catalog'::find_your_prices.scrape_target_kind,
  'https://meyko.com/shop',
  jsonb_build_object('markDelisted', true),
  720,      -- dos veces al dia
  120,
  20::smallint,
  true,
  'Barrido completo (~845 articulos, ~48 peticiones medidas el 2026-09-17). Unico target autorizado a marcar productos como delisted.'
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
