-- =============================================================================
-- 0037_seed_metromedia.sql
-- Alta de Metromedia (libreria, https://metromedia.hn) y de un target por
-- categoria raiz.
--
-- El sitio corre sobre Odoo eCommerce v13. Medido el 2026-09-18:
--
--   1. El html de /en_US/shop es SSR real con microdatos por tarjeta (precio,
--      moneda, url, imagen, descripcion). No hay JSON publico para anonimos:
--      /web/dataset/call_kw responde "Session Expired".
--   2. `?ppg=` se honra sin tope, pero el servidor rinde ~50 tarjetas/s sea
--      cual sea el tamano: 12 899 articulos son ~260 s de listados, mas que
--      el presupuesto del runner. Por eso NO hay target full_catalog y el
--      catalogo se reparte en 13 targets, uno por raiz de la barra lateral.
--   3. Un libro esta en varias categorias a la vez y la ingesta pisa
--      store_category_id, asi que cada target excluye lo que ya aparece en
--      las raices de mayor prioridad (las chicas, ~1 450 tarjetas, ~30 s).
--      Libros en Espanol e Ingles comparten 32 titulos que alternan de raiz:
--      excluir una de la otra costaria 140 s mas y no cabe.
--   4. Las hijas (52 generos) se publican en el arbol pero no se recorren:
--      los libros se atribuyen a la raiz. "Novedades", "Descuentos" y "Lo mas
--      leido" son listas promocionales y no se dan de alta.
--   5. Cobertura: 12 549 de 12 899 (97%). Los ~350 restantes no cuelgan de
--      ninguna categoria y quedan fuera.
--   6. Prioridad: Libros en Espanol (167 s) va primero para que arranque con
--      el presupuesto entero de la tanda; despues Ingles (~85 s) y las chicas.
--      Con 5 targets por disparo la tienda se cubre en tres tandas.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, request_timeout_ms, is_active, notes
)
values (
  'metromedia',
  'Metromedia',
  'https://metromedia.hn',
  'HN',
  'HNL',
  'es-HN',
  'metromedia',
  jsonb_build_object('webBaseUrl', 'https://metromedia.hn', 'langPrefix', '/en_US', 'pageSize', 1000, 'skipCategoryIds', '98,135,99'),
  300,
  1,
  60000,    -- una pagina de 1000 tarjetas tarda ~16 s; el default de 30 s queda justo
  true,
  'Odoo eCommerce v13 con html SSR y microdatos; ?ppg= honrado (1000 por pagina, ~16 s). '
  || '12 899 productos en 13 raices reales + 52 generos. Url canonica /en_US/shop/product/{slug}-{templateId}. '
  || 'Sin full_catalog: no cabe en 240 s. Cada target excluye lo ya atribuido a raices de mayor prioridad. '
  || 'La tarjeta no publica ISBN ni stock.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  request_timeout_ms = excluded.request_timeout_ms,
  notes = excluded.notes,
  updated_at = now();

with s as (select id from find_your_prices.stores where slug = 'metromedia')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Metromedia - ' || v.label,
  'category'::find_your_prices.scrape_target_kind,
  'https://metromedia.hn/en_US/shop/category/' || v.path,
  jsonb_build_object('categoryId', v.id),
  1440,                      -- una vez al dia: es una libreria, los precios no cambian a diario
  60,
  v.priority::smallint,
  true,
  v.notes
from s
cross join (values
  -- path / id / etiqueta / prioridad / nota con el conteo medido el 2026-09-18
  ('libros-en-espanol-84',     '84',  'Libros en Espanol',    10, '8364 tarjetas, 8177 propias (21 peticiones, 167 s). Va primero: necesita la tanda entera.'),
  ('libros-en-ingles-85',      '85',  'Libros en Ingles',     20, '3021 tarjetas, ~2900 propias (15 peticiones, ~85 s).'),
  ('comics-37',                '37',  'Comics',               30, '404 tarjetas (8 peticiones).'),
  ('libretas-79',              '79',  'Libretas',             30, '233 tarjetas.'),
  ('accesorios-80',            '80',  'Accesorios',           30, '164 tarjetas.'),
  ('literatura-hondurena-104', '104', 'Literatura Hondurena', 30, '147 tarjetas; 107 tambien estan en Libros en Espanol y se atribuyen aqui.'),
  ('entretenimiento-40',       '40',  'Entretenimiento',      30, '125 tarjetas: puzzles y juegos.'),
  ('libros-para-colorear-186', '186', 'Libros para colorear', 30, '116 tarjetas.'),
  ('biblia-118',               '118', 'Biblia',               40, '84 tarjetas.'),
  ('separadores-196',          '196', 'Separadores',          40, '84 tarjetas.'),
  ('coffee-table-books-132',   '132', 'Coffee Table Books',   40, '51 tarjetas.'),
  ('calendarios-108',          '108', 'Calendarios',          40, '26 tarjetas.'),
  ('agendas-107',              '107', 'Agendas',              40, '14 tarjetas. Primera de la prioridad: no excluye nada.')
) as v(path, id, label, priority, notes)
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
