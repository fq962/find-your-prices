-- =============================================================================
-- 0011_seed_diunsa.sql
-- Alta de la primera tienda y de sus targets iniciales.
--
-- Diunsa corre sobre Angular: el html que devuelve el servidor son esqueletos y
-- los productos los pinta el navegador contra una API JSON. Por eso la
-- estrategia 'diunsa' consume esa API directamente en vez de parsear html:
-- es mas rapido, mas estable y trae campos que la tarjeta visual no muestra
-- (codigo de barras, stock, ficha tecnica, garantias, todas las imagenes).
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'diunsa',
  'Diunsa',
  'https://www.diunsa.hn',
  'HN',
  'HNL',
  'es-HN',
  'diunsa',
  jsonb_build_object(
    'apiBaseUrl',  'https://apicsm.dapplications.tech/api/em',
    'webBaseUrl',  'https://www.diunsa.hn',
    'companyId',   '1',
    -- officeCode identifica la sucursal/bodega contra la que se cotiza.
    'officeCode',  '1',
    -- La API acepta hasta take=1000 por request; 2000 devuelve 400.
    'pageSize',    500
  ),
  400,
  2,
  true,
  'API JSON detectada en apicsm.dapplications.tech. groupCode "0" devuelve el catalogo completo.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Targets iniciales.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'diunsa')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, priority, is_active, notes
)
select s.id, v.name, v.kind, v.url, v.config, v.frequency_minutes, v.priority, v.is_active, v.notes
from s
cross join (values
  (
    'Diunsa - Catalogo completo',
    'full_catalog'::find_your_prices.scrape_target_kind,
    'https://www.diunsa.hn/',
    jsonb_build_object('groupCode', '0', 'syncCategories', true, 'markDelisted', true),
    720,      -- dos veces al dia
    10::smallint,
    true,
    'Barrido completo (~8000 articulos, 9 requests). Unico target autorizado a marcar productos como delisted.'
  ),
  (
    'Diunsa - Jugueteria',
    'category'::find_your_prices.scrape_target_kind,
    'https://www.diunsa.hn/jugueteria?page=1&pagesize=100',
    jsonb_build_object('groupCode', '258', 'syncCategories', false, 'markDelisted', false),
    360,      -- cada 6 horas
    50::smallint,
    true,
    'Categoria de ejemplo. groupCode 258 = Jugueteria (~858 articulos).'
  )
) as v(name, kind, url, config, frequency_minutes, priority, is_active, notes)
-- El indice scrape_targets_store_url_key es PARCIAL (where url is not null).
-- Postgres exige repetir ese predicado aqui para poder usarlo como arbitro del
-- on conflict; sin el falla con "no unique or exclusion constraint matching".
on conflict (store_id, url) where url is not null do update set
  name = excluded.name,
  kind = excluded.kind,
  config = excluded.config,
  frequency_minutes = excluded.frequency_minutes,
  priority = excluded.priority,
  notes = excluded.notes,
  updated_at = now();
