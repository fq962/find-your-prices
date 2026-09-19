-- =============================================================================
-- 0040_seed_officedepot.sql
-- Alta de Office Depot Honduras (https://www.officedepot.com.hn) y de su
-- target de catalogo completo.
--
-- El sitio corre sobre SAP Commerce (Hybris) Accelerator. Medido el 2026-09-18:
--
--   1. El html es SSR real, pero no hace falta parsearlo: la misma tienda
--      publica su API OCC v2 sin autenticacion en /occ/v2/officedepotHN.
--      (/rest/v2/... responde 404: la puerta buena es /occ/v2/.)
--   2. `pageSize` topa en 100 pase lo que pase. El catalogo son 4 056
--      articulos = 41 peticiones de ~0.3 s.
--   3. El orden importa: con `query=:relevance` el barrido devuelve 3 909
--      articulos distintos porque el orden se reacomoda entre peticiones.
--      Con `:name-asc` salen los 4 056 exactos. La estrategia fija ese orden.
--   4. La busqueda entrega el NOMBRE de la categoria, nunca su codigo, y el
--      arbol del catalogo repite 213 nombres en ramas distintas. La estrategia
--      resuelve el codigo con el primer segmento de la url del producto, la
--      ascendencia declarada y, para los 35 nombres que siguen ambiguos, un
--      sondeo por candidato. Con eso los 4 056 articulos quedan clasificados.
--   5. Cabe entero en una corrida: medido 132 s la primera (4 056 altas) y
--      73 s la segunda (4 056 sin cambios, 0 actualizados). Por eso hay un
--      solo target `full_catalog` y no un reparto por categorias.
--   6. La galeria completa solo esta en la ficha de cada producto: 4 056
--      peticiones extra. Se guarda la unica imagen que da la busqueda, en su
--      tamano mayor (515 px).
--
-- El mapeo de sus categorias al arbol canonico va en 0041_map_officedepot.sql.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, request_timeout_ms, is_active, notes
)
values (
  'officedepot',
  'Office Depot',
  'https://www.officedepot.com.hn',
  'HN',
  'HNL',
  'es-HN',
  'officedepot',
  '{}'::jsonb,   -- los valores por defecto viven en la estrategia
  300,
  2,
  30000,
  true,
  'SAP Commerce (Hybris). API OCC v2 publica en /occ/v2/officedepotHN, sin autenticacion. '
  || '4 056 articulos, pageSize tope 100 (41 paginas). Orden :name-asc obligatorio: con :relevance '
  || 'el barrido pierde ~150 articulos. price = lista, discountedPrice = lo que se paga. '
  || 'La busqueda solo da el nombre de la categoria: el codigo se resuelve contra el arbol del '
  || 'catalogo y, en los 35 nombres repetidos, sondeando cada candidato. Imagenes en /medias/ '
  || '(el prefijo /officedepotocc/v2 da 404); solo una por articulo, la galeria esta unicamente '
  || 'en la ficha. 118 descripciones vienen rotas en origen y se descartan.'
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
  select id from find_your_prices.stores where slug = 'officedepot'
)
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Catalogo completo',
  'full_catalog',
  'https://www.officedepot.com.hn/officedepotHN/en/Categor%C3%ADa/c/ROOT',
  '{}'::jsonb,
  1440,
  80,   -- el barrido usa 41; el resto es margen por si crece el catalogo
  100,
  true,
  '41 paginas de 100 + el arbol de categorias + ~60 sondeos de categorias ambiguas. '
  || 'Medido: 132 s la primera corrida, 73 s la segunda.'
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
