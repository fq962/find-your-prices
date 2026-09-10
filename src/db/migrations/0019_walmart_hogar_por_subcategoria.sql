-- =============================================================================
-- 0019_walmart_hogar_por_subcategoria.sql
-- Parte "Articulos para el hogar" en un target por subcategoria.
--
-- Por que: en la primera corrida real contra la base, ese target trajo los
-- 4430 articulos completos pero tardo 278 s y el runner lo corto en su
-- presupuesto de 240 s -> quedo en estado 'partial'. Barrer el sitio solo son
-- ~126 s; el resto es la ingesta a Supabase, que en la medicion local no
-- estaba. En Vercel, con techo de 300 s, el margen es todavia menor.
--
-- La estrategia ya sabe repartirlo sola (por eso trajo los 4430), pero hacerlo
-- dentro de una sola corrida no cabe en el presupuesto. Partido en 14 targets,
-- el mas grande (Articulos de Temporada, 1392) son 28 peticiones: entra
-- holgado, y el cron los reparte en tandas.
--
-- El target del departamento queda desactivado, no borrado: asi se conserva su
-- historial de corridas y se puede reactivar si algun dia sube el presupuesto.
-- Conteos medidos contra la API el 2026-09-09; suman exactamente 4430, el
-- mismo total que declara el departamento (no hay articulos colgados solo del
-- nivel de arriba).
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

update find_your_prices.scrape_targets t
set is_active = false,
    notes = 'Reemplazado por los 14 targets de subcategoria de la migracion 0019: '
         || 'la corrida completa (4430 articulos) tarda ~278 s con la ingesta y '
         || 'el runner corta a los 240 s, dejandola en partial.',
    updated_at = now()
from find_your_prices.stores s
where t.store_id = s.id
  and s.slug = 'walmarthn'
  and t.url = 'https://www.walmart.com.hn/articulos-para-el-hogar';

with s as (select id from find_your_prices.stores where slug = 'walmarthn')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, max_pages, priority, is_active, notes
)
select
  s.id,
  'Walmart HN - Hogar / ' || v.label,
  'category'::find_your_prices.scrape_target_kind,
  'https://www.walmart.com.hn/articulos-para-el-hogar/' || v.path,
  jsonb_build_object('categoryPath', 'articulos-para-el-hogar/' || v.path),
  1440,
  60,
  35::smallint,
  true,
  v.notes
from s
cross join (values
  ('articulos-de-temporada',           'Articulos de Temporada',           '1392 articulos medidos el 2026-09-09 (28 peticiones).'),
  ('accesorios-para-cocina',           'Accesorios para Cocina',           '562 articulos medidos el 2026-09-09 (12 peticiones).'),
  ('papeleria',                        'Papeleria',                        '418 articulos medidos el 2026-09-09 (9 peticiones).'),
  ('decoracion-y-muebles',             'Decoracion y Muebles',             '369 articulos medidos el 2026-09-09 (8 peticiones).'),
  ('ferreteria',                       'Ferreteria',                       '349 articulos medidos el 2026-09-09 (7 peticiones).'),
  ('colchones-y-blancos',              'Colchones y Blancos',              '346 articulos medidos el 2026-09-09 (7 peticiones).'),
  ('accesorios-para-mesa',             'Accesorios para Mesa',             '329 articulos medidos el 2026-09-09 (7 peticiones).'),
  ('jardineria-y-exteriores',          'Jardineria y Exteriores',          '272 articulos medidos el 2026-09-09 (6 peticiones).'),
  ('organizacion-y-almacenamiento',    'Organizacion y Almacenamiento',    '219 articulos medidos el 2026-09-09 (5 peticiones).'),
  ('pintura',                          'Pintura',                          '131 articulos medidos el 2026-09-09 (3 peticiones).'),
  ('escritorios-y-muebles-de-oficina', 'Escritorios y Muebles de Oficina', '17 articulos medidos el 2026-09-09 (1 peticion).'),
  ('comedores-y-muebles-de-cocina',    'Comedores y Muebles de Cocina',    '12 articulos medidos el 2026-09-09 (1 peticion).'),
  ('salas-y-centro-de-entretenimiento','Salas y Centro de Entretenimiento','11 articulos medidos el 2026-09-09 (1 peticion).'),
  ('libros-y-revistas',                'Libros y Revistas',                '3 articulos medidos el 2026-09-09 (1 peticion).')
) as v(path, label, notes)
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
