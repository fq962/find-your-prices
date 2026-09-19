-- =============================================================================
-- 0042_seed_paperdepot.sql
-- Alta de Paper Depot (https://www.paperdepothn.com), libreria y papeleria de
-- oficina, y de su target de catalogo completo.
--
-- El sitio es PHP propio, sin plataforma conocida y sin JSON publico: el unico
-- endpoint ajax que expone es `carrito_ajax.php`, que solo escribe en el
-- carrito de la sesion. Aca si hay que parsear html. Medido el 2026-09-19:
--
--   1. /grupo/{id}?page=N pagina de 20 en 20 y el tamano es fijo: limit,
--      per_page, cantidad, ipp, rows, size y count no cambian nada.
--   2. **El listado no muestra la rebaja.** Un articulo en oferta sale en su
--      grupo con el precio de lista (06050: L. 164.28) y solo /ofertas y la
--      ficha traen el que se paga (L. 89.68). Son 1 915 de 5 550 articulos, asi
--      que toda corrida lee /ofertas (96 paginas) y superpone esos precios. Sin
--      eso estariamos publicando precios inflados en un tercio del catalogo.
--   3. **Los precios son sin ISV** ("L. 3.89 + ISV" en la ficha). Se guarda el
--      numero publicado, con tax_included=false y tax_rate=15; el precio con
--      impuesto va en attributes.price_with_tax.
--   4. El menu lista 63 grupos, que son los unicos legibles: los demas
--      responden 302 hacia /grupo/404.php con el listado dentro del cuerpo del
--      302, y `fetch` sigue la redireccion y se queda con la pagina de error.
--      Los 532 articulos que viven ahi asoman en /ofertas y se publican desde
--      ahi, sin categoria.
--   5. Un articulo esta en un solo grupo (medido sobre 5 018 tarjetas): no hace
--      falta la regla de prioridad entre targets que si necesita Metromedia.
--   6. Cobertura y costo: 390 peticiones, 118 s de estrategia (158 s de
--      corrida con la ingesta), 5 550 articulos, 5 018 con categoria. Cabe
--      entero en los 240 s del runner, asi que hay un solo target full_catalog.
--
-- El mapeo de sus categorias al arbol canonico va en 0043_map_paperdepot.sql.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, request_timeout_ms, is_active, notes
)
values (
  'paperdepot',
  'Paper Depot',
  'https://www.paperdepothn.com',
  'HN',
  'HNL',
  'es-HN',
  'paperdepot',
  '{}'::jsonb,   -- los valores por defecto viven en la estrategia
  150,
  1,
  30000,
  true,
  'Sitio PHP propio, html SSR, sin JSON publico. 20 por pagina fijo (?page=N). '
  || 'El listado de grupo NO muestra la rebaja: publica el precio de lista incluso para los '
  || '1 915 articulos en oferta, asi que cada corrida lee /ofertas (96 paginas) y superpone el '
  || 'precio que se paga. Precios SIN ISV (la ficha dice "+ ISV"): se guarda el numero publicado '
  || 'con tax_included=false y tax_rate=15, y el precio con impuesto va en attributes.price_with_tax. '
  || 'Imagenes: /thumbs.php devuelve html, la buena es /media/image.php?file=. El menu lista 63 '
  || 'grupos; el resto responde 302 a /grupo/404.php y es ilegible con fetch, asi que sus 532 '
  || 'articulos se publican desde /ofertas sin categoria. Barrido completo: 390 peticiones, 118 s, '
  || '5 550 articulos.'
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
  select id from find_your_prices.stores where slug = 'paperdepot'
)
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Catalogo completo',
  'full_catalog',
  'https://www.paperdepothn.com/',
  '{}'::jsonb,
  1440,
  500,   -- el barrido usa 390; el resto es margen por si crece el catalogo
  100,
  true,
  '1 peticion del menu + 96 de /ofertas + 293 de los 63 grupos = 390. '
  || 'Medido: 118 s de estrategia, 5 550 articulos (5 018 con categoria).'
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
