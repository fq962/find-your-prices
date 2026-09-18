-- =============================================================================
-- 0034_seed_kielsa.sql
-- Alta de Farmacias Kielsa (https://kielsa.com) y de un target de catalogo
-- completo.
--
-- El sitio es un Meteor: el html no trae productos y el catalogo se publica
-- por DDP (WebSocket) en wss://kielsa.com/websocket. Medido el 2026-09-18:
--
--   1. La publicacion "ProductFake.category" con productName "no-one" devuelve
--      el catalogo visible entero: 6 860 articulos con 158 campos cada uno.
--      El parametro de categoria no filtra en el servidor.
--   2. Paginacion con trampa: si skip + pageSize supera el total, devuelve
--      cero documentos. La estrategia baja de tamano (500, 100, 10, 1) al
--      chocar con el final: 26 suscripciones, ~38 s, sin perder la cola.
--   3. Es la unica estrategia que no pasa por http.ts: el cliente DDP vive en
--      src/server/scraping/ddp.ts y pone su propia pausa entre suscripciones.
--   4. Trae stock (AxB_Existencia): cambia entre corridas y cada cambio marca
--      el articulo como actualizado. Es dato real, no ruido.
--   5. ~400 articulos traen la imagen en base64: se guardan sin imagen.
--   6. El barrido cubre todo el catalogo: este target da de baja lo retirado.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'kielsa',
  'Farmacias Kielsa',
  'https://kielsa.com',
  'HN',
  'HNL',
  'es-HN',
  'kielsa',
  jsonb_build_object('ddpUrl', 'wss://kielsa.com/websocket', 'pageSize', 500, 'delayMs', 300),
  300,
  1,
  true,
  'Meteor: catalogo por DDP (WebSocket), publicacion ProductFake.category. '
  || '6 860 articulos, 137 categorias derivadas de los propios documentos. '
  || 'Url publica /productDetail/{mongoId}; external_id = Articulo_Id (SKU del ERP). '
  || 'Precios con descuento en ~70 % del catalogo; stock de la bodega web.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  notes = excluded.notes,
  updated_at = now();

with s as (select id from find_your_prices.stores where slug = 'kielsa')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Kielsa - Catalogo completo',
  'full_catalog'::find_your_prices.scrape_target_kind,
  'https://kielsa.com/',
  jsonb_build_object('markDelisted', true),
  720,      -- dos veces al dia
  100,
  20::smallint,
  true,
  'Barrido completo por DDP (~6 860 articulos, 26 suscripciones medidas el 2026-09-18). Unico target autorizado a marcar productos como delisted.'
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
