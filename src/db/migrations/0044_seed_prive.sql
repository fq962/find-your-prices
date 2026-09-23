-- =============================================================================
-- 0044_seed_prive.sql
-- Alta de Prive Perfumes (https://priveperfumes.com), perfumeria comercial, de
-- nicho y arabe, y de su target de catalogo completo.
--
-- El sitio es Shopify: el catalogo sale de /collections/{handle}/products.json
-- sin parsear html, con la fabrica de Ladylee (strategies/prive.ts). Medido el
-- 2026-09-22:
--
--   1. /collections/all entrega 3 929 fichas en 16 paginas de 250. La pagina
--      pedida (/collections/todo-en-perfumeria) es un subconjunto de 3 639.
--   2. 893 fichas son "padres" de Combined Listings (tag combined_listing):
--      agrupan los tamaños de un perfume que ademas existen como productos
--      propios con el mismo id de variante. La estrategia los descarta junto
--      con las 5 gift cards: quedan 3 036 articulos.
--   3. Categorias: los 9 segmentos del menu (bebe, niños, mini, body, estuches,
--      arabe, exclusiva, economica, comercial) y "Perfumeria" para los ~130
--      que solo cuelgan de "all".
--   4. products.json responde 503 de vez en cuando; el cliente http reintenta.
--
-- El mapeo de sus categorias al arbol canonico va en 0045_map_prive.sql.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, request_timeout_ms, is_active, notes
)
values (
  'prive',
  'Prive Perfumes',
  'https://priveperfumes.com',
  'HN',
  'HNL',
  'es-HN',
  'prive',
  '{}'::jsonb,   -- los valores por defecto viven en la estrategia
  500,
  1,
  30000,
  true,
  'Shopify: catalogo desde /collections/{handle}/products.json (250 por pagina). '
  || 'Descarta las fichas padre de Combined Listings (tag combined_listing), que repiten '
  || 'los tamaños publicados como productos propios, y las gift cards. Genero y concentracion '
  || 'salen de los tags Para_* y Concentración_*; el tamaño, de la variante o del nombre. '
  || 'Sin codigo de barras publico. Barrido completo: ~40 peticiones, 3 036 articulos.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  request_timeout_ms = excluded.request_timeout_ms,
  notes = excluded.notes,
  updated_at = now();

with s as (
  select id from find_your_prices.stores where slug = 'prive'
)
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Catalogo completo',
  'full_catalog',
  'https://priveperfumes.com/collections/all',
  '{}'::jsonb,
  1440,
  null,   -- tope por coleccion de la fabrica (100 paginas); "all" usa 16
  100,
  true,
  '9 colecciones del menu + /collections/all al final para lo que no cuelga de ninguna.'
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
