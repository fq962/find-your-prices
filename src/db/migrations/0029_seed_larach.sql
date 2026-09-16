-- =============================================================================
-- 0029_seed_larach.sql
-- Alta de Larach y Cia (ferreteria, https://larachycia.com) y de un target por
-- departamento: los 18 departamentos son el catalogo completo.
--
-- larachycia.com es un Angular con render en servidor que pinta las tarjetas
-- contra una API JSON propia (AWS API Gateway), publica y sin autenticacion:
--
--   POST https://k1t4zxzvq8.execute-api.us-east-2.amazonaws.com/dev/items
--   body: { paginate: { page, pageSize, records: 0, orderBy }, category: "<id>" }
--
-- Medido el 2026-09-15:
--
--   1. Sin `category` la API devuelve el catalogo entero: 26 226 articulos.
--      pageSize no tiene tope practico, pero una pagina de 1000 tarda ~5 s:
--      27 paginas son ~130 s solo de descarga, y la ingesta de 26k articulos
--      no cabe en los 240 s del runner (Walmart Hogar, con 4430, tardo 278 s).
--      Por eso se reparte por departamento, como en la migracion 0019.
--
--   2. Consultar un departamento incluye a todas sus subcategorias, y los 18
--      departamentos suman exactamente 26 226. El mas grande (Herrajes, 4565)
--      son 5 peticiones de 1000: cabe.
--
--   3. Como son targets de categoria, el runner NO da de baja lo retirado
--      (eso solo lo hace full_catalog). Misma limitacion que en Walmart.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'larach',
  'Larach y Cia',
  'https://larachycia.com',
  'HN',
  'HNL',
  'es-HN',
  'larach',
  jsonb_build_object(
    'apiBaseUrl', 'https://k1t4zxzvq8.execute-api.us-east-2.amazonaws.com/dev',
    'webBaseUrl', 'https://larachycia.com',
    'mediaBaseUrl', 'https://media.larachycia.com',
    'pageSize', 1000,
    -- Con `category` la API devuelve solo la rama de ese departamento: cada
    -- target sincroniza sus subcategorias y el departamento se deriva del parent.
    'syncCategories', true
  ),
  500,
  1,
  true,
  'Angular SSR sobre API JSON propia en AWS (sin autenticacion). 26 226 articulos '
  || 'en 18 departamentos; se barre uno por target porque el catalogo entero no '
  || 'cabe en el presupuesto del runner. Url publica /p/{slug}/{itemCode}, slug '
  || 'verificado al 100 % contra 64 enlaces reales. Imagenes en media.larachycia.com.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  request_delay_ms = excluded.request_delay_ms,
  notes = excluded.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Un target por departamento. La url es la de la categoria en el sitio (sirve
-- de llave de idempotencia); el id que consume la API va en config.category.
-- Conteos medidos contra la API el 2026-09-15; suman 26 226.
-- Frecuencia diaria: es ferreteria, los precios cambian por campaña.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'larach')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Larach - ' || v.label,
  'category'::find_your_prices.scrape_target_kind,
  'https://larachycia.com/c/' || v.slug || '/' || v.id,
  jsonb_build_object('category', v.id::text),
  1440,
  20,
  30::smallint,
  true,
  v.count || ' articulos medidos el 2026-09-15 (' || ceil(v.count / 1000.0) || ' peticiones de 1000).'
from s
cross join (values
  (1,   'Automotriz',                 'Automotriz',                     1005),
  (2,   'Construcción',               'Construcci-C3-B3n',              1125),
  (3,   'Electricidad',               'Electricidad',                   2169),
  (4,   'Fontanería',                 'Fontaner-C3-ADa',                2304),
  (5,   'Herrajes',                   'Herrajes',                       4565),
  (6,   'Herramientas Eléctricas',    'Herramientas-El-C3-A9ctricas',    857),
  (7,   'Herramientas Manuales',      'Herramientas-Manuales',          2352),
  (8,   'Hogar',                      'Hogar',                          1522),
  (9,   'Jardinería',                 'Jardiner-C3-ADa',                1096),
  (10,  'Lámparas',                   'L-C3-A1mparas',                   863),
  (11,  'Loza y Cerámica',            'Loza-y-Cer-C3-A1mica',            306),
  (12,  'Mascotas',                   'Mascotas',                        168),
  (13,  'Papeleria',                  'Papeleria',                      3917),
  (14,  'Pinturas',                   'Pinturas',                       1061),
  (15,  'Tecnología',                 'Tecnolog-C3-ADa',                 334),
  (623, 'Navidad',                    'Navidad',                        2528),
  (625, 'Abarroteria',                'Abarroteria',                      27),
  (639, 'Galletas',                   'Galletas',                         27)
) as v(id, label, slug, count)
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
