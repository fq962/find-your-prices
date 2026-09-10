-- =============================================================================
-- 0022_seed_pricesmart.sql
-- Alta de PriceSmart Honduras y de su target de catalogo completo.
--
-- www.pricesmart.com/es-hn es un Nuxt con Vue Storefront 2. El html del
-- servidor pesa 384 KB y trae CERO productos: las tarjetas las pinta el
-- navegador contra Bloomreach Discovery, que el propio sitio expone como proxy:
--
--   POST https://www.pricesmart.com/api/br_discovery/getProductsByKeyword
--   body: [ { q: <codigo>, search_type: 'category', start, rows, fl, view_id } ]
--
-- (El body es un array de un objeto: convencion del middleware de Vue
-- Storefront, donde los argumentos del metodo van posicionalmente.)
--
-- Tres cosas que condicionan la configuracion de abajo:
--
--   1. `rows` tope 200. Con 250, 300, 400, 500 o 1000 el proxy responde 400.
--      `start` en cambio no tiene tope practico: start=1000 sobre una categoria
--      de 1117 devuelve los 117 que faltan. No hace falta repartir por
--      subcategorias como en Walmart.
--
--   2. Consultar una categoria raiz incluye a todos sus descendientes
--      (verificado: los 202 articulos de tres subcategorias de Alimentos estan
--      dentro de los 1117 de Alimentos). Por eso las 25 categorias de nivel 1
--      SON el catalogo completo, y por eso hay un solo target de tipo
--      full_catalog en vez de 25 targets de categoria: cubre todo, permite dar
--      de baja lo retirado y cabe holgado en el presupuesto de tiempo.
--
--   3. Es un club de membresia, no un hipermercado: el catalogo hondureño
--      entero son 2777 articulos declarados / 2763 unicos (14 estan en dos
--      departamentos a la vez). Barrido completo medido el 2026-09-10:
--      **31 peticiones, 18.9 s, 3.6 MB, 0 errores http, 543 categorias**.
--
-- Cortesia: robots.txt bloquea a ClaudeBot, GPTBot y CCBot, pero para
-- `User-agent: *` solo cierra carrito, cuenta, pdf y las urls con `fq=`
-- (facetas). Nuestro user agent recibe 200 tanto en el proxy como en el
-- sitemap, y la estrategia manda siempre `fq: []`. No hay que disfrazar nada.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'pricesmart',
  'PriceSmart Honduras',
  'https://www.pricesmart.com/es-hn',
  'HN',
  'HNL',
  'es-HN',
  'pricesmart',
  jsonb_build_object(
    'apiUrl', 'https://www.pricesmart.com/api/br_discovery/getProductsByKeyword',
    'webBaseUrl', 'https://www.pricesmart.com',
    'localePath', 'es-hn',
    -- Credenciales publicas de Bloomreach que el propio sitio manda en cada
    -- peticion desde el navegador. Van en config y no en el codigo para poder
    -- corregirlas sin desplegar si PriceSmart las rota.
    'accountId', '7024',
    'authKey', 'ev7libhybjg5h1d1',
    'domainKey', 'pricesmart_bloomreach_io_es',
    -- Sufijo de los campos por pais (price_HN, inventory_HN) y valor de view_id.
    -- La misma cuenta de Bloomreach sirve a los 14 paises de la cadena.
    'viewId', 'HN',
    -- Maximo real: con 250 o mas el proxy responde 400.
    'pageSize', 200,
    -- El arbol de categorias viene en el facet de la misma respuesta: 543
    -- categorias sin una sola peticion extra, y con los nombres acentuados de
    -- verdad (el sitemap los trae sin tildes).
    'syncCategories', true
  ),
  400,
  1,
  true,
  'Bloomreach Discovery via el proxy del propio sitio (Nuxt + Vue Storefront 2). '
  || 'El html no trae productos. rows tope 200; start sin tope. Consultar una '
  || 'categoria raiz incluye a sus descendientes, asi que las 25 de nivel 1 son '
  || 'el catalogo completo: 2763 articulos unicos en 31 peticiones (~19 s), '
  || 'medido el 2026-09-10. Ojo: el campo "url" de la API apunta al sitio de '
  || 'Costa Rica y se ignora; la url publica se arma con slug + master_sku.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  notes = excluded.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Target unico: el catalogo completo.
--
-- Un solo target de tipo full_catalog en vez de 25 de categoria, porque:
--
--   - Cubre exactamente lo mismo (las 25 raices incluyen a sus hijas) con las
--     mismas 31 peticiones, pero en UNA corrida en vez de 25.
--   - Solo los targets full_catalog dan de baja lo que la tienda retiro. Con 25
--     targets de categoria, un articulo descontinuado se quedaria vivo en el
--     comparador para siempre.
--   - Cabe holgado: 19 s de barrido mas la ingesta, contra el presupuesto de
--     240 s del runner. Fue justo lo contrario en Walmart, donde un solo
--     departamento no cabia y hubo que partirlo en 14 (migracion 0019).
--
-- La lista de raices vive en el codigo de la estrategia (DEFAULT_ROOT_CATEGORIES)
-- y se puede sobreescribir desde aca con 'rootCategories' si PriceSmart agrega o
-- quita un departamento, sin desplegar.
--
-- Frecuencia: cada 6 h. Es un catalogo chico y barato de barrer (3.6 MB), y los
-- precios de club cambian por campaña, no por hora.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'pricesmart')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'PriceSmart HN - Catalogo completo',
  'full_catalog'::find_your_prices.scrape_target_kind,
  'https://www.pricesmart.com/es-hn/categorias',
  '{}'::jsonb,
  360,      -- cada 6 horas
  120,      -- tope duro de peticiones; el barrido real usa 31
  10::smallint,
  true,
  'Barre las 25 categorias de nivel 1, que entre todas son el catalogo entero. '
  || 'Medido el 2026-09-10: 2777 articulos declarados, 2763 unicos (14 cruzados '
  || 'entre dos departamentos), 543 categorias, 31 peticiones, 18.9 s, 0 errores. '
  || 'Reparto por departamento: Alimentos 1117, Hogar 325, Moda 192, Salud y '
  || 'belleza 186, Automotriz 101, Licor 98, Exteriores 84, Electrodomesticos 80, '
  || 'Ferreteria 78, Electronicos 76, Temporada 67, Optica 55, Muebles 47, '
  || 'Deportes 46, Bebe 42, Mascotas 38, Computadoras 37, Linea blanca 33, '
  || 'Juguetes 25, Restaurantes 22, Oficina 17, Equipaje 10, Peliculas 1. '
  || 'Audiologia y Joyeria declaran 0 articulos en Honduras.'
from s
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
  is_active = excluded.is_active,
  notes = excluded.notes,
  updated_at = now();
