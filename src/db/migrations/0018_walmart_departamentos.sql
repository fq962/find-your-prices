-- =============================================================================
-- 0018_walmart_departamentos.sql
-- Los departamentos de Walmart Honduras que faltaban.
--
-- 0017 dio de alta tres (Abarrotes, Higiene y Belleza, Articulos para el
-- hogar). El sitio publica 20 departamentos raiz con ~18 553 articulos en
-- total; esta migracion agrega los 16 que quedaban. Conteos medidos contra la
-- API el 2026-09-09 (header `resources` de products/search).
--
-- Se deja fuera 'anthistaminicos': aparece en el sitemap de categorias pero
-- devuelve 0 articulos. Es una categoria vacia del catalogo, no un
-- departamento real; darla de alta solo agregaria una corrida inutil cada dia.
--
-- Por que un target por departamento y no uno de catalogo completo:
-- el barrido de los 20 son ~380 peticiones (~6 min con la cortesia de 400 ms)
-- y el runner corta a los 240 s. Partido asi, el mas grande de los nuevos
-- (Ropa y Zapateria, 37 peticiones) tarda ~45 s. El cron toma 5 targets por
-- disparo, o sea que la tienda entera se cubre en cuatro tandas.
--
-- Ninguno excede los 2550 articulos que entrega la API por consulta, asi que
-- ninguno necesita el reparto por subcategorias (el unico que lo necesita
-- sigue siendo Articulos para el hogar, dado de alta en 0017).
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

with s as (select id from find_your_prices.stores where slug = 'walmarthn')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Walmart HN - ' || v.label,
  'category'::find_your_prices.scrape_target_kind,
  'https://www.walmart.com.hn/' || v.path,
  jsonb_build_object('categoryPath', v.path),
  v.frequency_minutes,
  60,                        -- 51 peticiones cubren el tope de la API; sobra margen
  v.priority::smallint,
  true,
  v.notes
from s
cross join (values
  -- path / etiqueta / frecuencia / prioridad / nota con el conteo medido
  ('ropa-y-zapateria',            'Ropa y Zapateria',            1440, 40, '1818 articulos medidos el 2026-09-09 (37 peticiones).'),
  ('limpieza',                    'Limpieza',                     720, 30, '1165 articulos medidos el 2026-09-09 (24 peticiones).'),
  ('juguetes',                    'Juguetes',                    1440, 40, '1051 articulos medidos el 2026-09-09 (22 peticiones).'),
  ('electronica',                 'Electronica',                 1440, 40, '702 articulos medidos el 2026-09-09 (15 peticiones).'),
  ('jugos-y-bebidas',             'Jugos y Bebidas',              720, 30, '582 articulos medidos el 2026-09-09 (12 peticiones).'),
  ('lacteos',                     'Lacteos',                      720, 30, '487 articulos medidos el 2026-09-09 (10 peticiones).'),
  ('farmacia',                    'Farmacia',                     720, 30, '480 articulos medidos el 2026-09-09 (10 peticiones).'),
  ('bebes-y-ninos',               'Bebes y Ninos',                720, 30, '461 articulos medidos el 2026-09-09 (10 peticiones).'),
  ('deportes',                    'Deportes',                    1440, 40, '439 articulos medidos el 2026-09-09 (9 peticiones).'),
  ('cervezas-vinos-y-licores',    'Cervezas, Vinos y Licores',   1440, 40, '383 articulos medidos el 2026-09-09 (8 peticiones).'),
  ('autos',                       'Autos',                       1440, 40, '379 articulos medidos el 2026-09-09 (8 peticiones).'),
  ('carnes-embutidos-y-mariscos', 'Carnes, Embutidos y Mariscos', 720, 30, '362 articulos medidos el 2026-09-09 (8 peticiones).'),
  ('panaderia-y-tortilleria',     'Panaderia y Tortilleria',      720, 30, '299 articulos medidos el 2026-09-09 (6 peticiones).'),
  ('mascota',                     'Mascota',                     1440, 40, '263 articulos medidos el 2026-09-09 (6 peticiones).'),
  ('alimentos-congelados',        'Alimentos Congelados',         720, 30, '193 articulos medidos el 2026-09-09 (4 peticiones).'),
  ('frutas-y-verduras',           'Frutas y Verduras',            720, 30, '180 articulos medidos el 2026-09-09 (4 peticiones).')
) as v(path, label, frequency_minutes, priority, notes)
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
  notes = excluded.notes,
  updated_at = now();
