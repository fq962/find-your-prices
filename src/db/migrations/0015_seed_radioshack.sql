-- =============================================================================
-- 0015_seed_radioshack.sql
-- Alta de la tienda RadioShack Honduras y de sus targets iniciales.
--
-- radioshackla.com/honduras es Adobe Commerce (Magento 2) sobre la plataforma
-- multi-pais de Grupo Unicomer. Expone GraphQL publico y sin autenticacion
-- (el mismo que usa su propio storefront), asi que la estrategia 'radioshack'
-- lo consume directo en vez de parsear html: header "Store: rso_honduras_sv"
-- obligatorio (sin el, la API responde con la tienda global en USD).
--
-- `search: ""` sin filtro trae el catalogo completo (782 articulos, 100% en
-- stock: el indice de busqueda de Magento excluye lo agotado). pageSize
-- maximo REAL es 500 aunque la API no lo declare: pasarse no da error, da
-- total_count 0 en silencio.
--
-- Idempotente: se puede volver a ejecutar sin duplicar filas.
-- =============================================================================

insert into find_your_prices.stores (
  slug, name, base_url, country_code, default_currency, default_locale,
  strategy_key, config, request_delay_ms, max_concurrency, is_active, notes
)
values (
  'radioshack-hn',
  'RadioShack Honduras',
  'https://www.radioshackla.com/honduras',
  'HN',
  'HNL',
  'es-HN',
  'radioshack',
  jsonb_build_object(
    'graphqlUrl', 'https://www.radioshackla.com/honduras/graphql',
    'storeCode', 'rso_honduras_sv',
    'webBaseUrl', 'https://www.radioshackla.com/honduras',
    -- La API no avisa si se pasa el limite real: pageSize > 500 da 0 resultados en silencio.
    'pageSize', 500
  ),
  800,
  1,
  true,
  'Adobe Commerce (Magento) GraphQL publico. Durante la investigacion el WAF de Grupo Unicomer bloqueo temporalmente por exceso de requests seguidos: delay de cortesia mas alto que el resto de las tiendas.'
)
on conflict (slug) do update set
  base_url = excluded.base_url,
  strategy_key = excluded.strategy_key,
  config = excluded.config,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Targets iniciales.
-- -----------------------------------------------------------------------------
with s as (select id from find_your_prices.stores where slug = 'radioshack-hn')
insert into find_your_prices.scrape_targets (
  store_id, name, kind, url, config, frequency_minutes, priority, is_active, notes
)
select s.id, v.name, v.kind, v.url, v.config, v.frequency_minutes, v.priority, v.is_active, v.notes
from s
cross join (values
  (
    'RadioShack HN - Catalogo completo',
    'full_catalog'::find_your_prices.scrape_target_kind,
    'https://www.radioshackla.com/honduras/c',
    jsonb_build_object('syncCategories', true, 'markDelisted', true),
    720,      -- dos veces al dia
    10::smallint,
    true,
    'Barrido completo (~782 articulos, 2 requests a 500 por pagina). Unico target autorizado a marcar productos como delisted.'
  ),
  (
    'RadioShack HN - Audifonos',
    'category'::find_your_prices.scrape_target_kind,
    'https://www.radioshackla.com/honduras/c/audio/audifonos',
    jsonb_build_object('categoryUrlPath', 'c/audio/audifonos', 'syncCategories', false),
    360,      -- cada 6 horas
    50::smallint,
    true,
    'Categoria de ejemplo. categoryUrlPath debe coincidir exacto con el valor que usa el filtro category_url_path del GraphQL.'
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
