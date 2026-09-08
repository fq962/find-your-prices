-- =============================================================================
-- 0003_stores_and_targets.sql
-- Registro de comercios y de los objetivos de scraping que administra el panel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stores: un comercio (Diunsa, La Curacao, Radio Shack, Ladylee...).
-- Es la unidad que se registra una sola vez; sus urls a scrapear viven en
-- scrape_targets.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.stores (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,                 -- 'diunsa', identificador estable en codigo y urls
  name                text not null,                        -- 'Diunsa'
  legal_name          text,                                 -- razon social, si se conoce
  base_url            text not null,                        -- 'https://www.diunsa.hn'
  logo_url            text,
  country_code        char(2) not null default 'HN',        -- ISO 3166-1 alpha-2
  default_currency    char(3) not null default 'HNL',       -- ISO 4217; fallback cuando el scraper no reporta moneda
  default_locale      text not null default 'es-HN',

  -- Estrategia de scraping por defecto de la tienda. Es la clave con la que el
  -- runner busca la implementacion registrada en src/server/scraping/registry.ts.
  strategy_key        text not null,                        -- 'diunsa'

  -- Configuracion compartida por todos los targets de la tienda (endpoints base,
  -- headers, ids internos como officeCode). La forma la define cada estrategia.
  config              jsonb not null default '{}'::jsonb,

  -- Politica de cortesia: se respeta en el cliente http del runner.
  request_delay_ms    integer not null default 500 check (request_delay_ms >= 0),
  max_concurrency     integer not null default 2 check (max_concurrency between 1 and 32),
  request_timeout_ms  integer not null default 30000 check (request_timeout_ms > 0),
  max_retries         integer not null default 3 check (max_retries >= 0),
  user_agent          text,                                 -- null -> usa el user agent por defecto del proyecto
  respect_robots_txt  boolean not null default true,

  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists stores_active_idx on find_your_prices.stores (is_active) where is_active;

drop trigger if exists stores_set_updated_at on find_your_prices.stores;
create trigger stores_set_updated_at before update on find_your_prices.stores
  for each row execute function find_your_prices.set_updated_at();

-- -----------------------------------------------------------------------------
-- scrape_targets: cada fila es "esta url / este listado, cada X minutos, con
-- esta estrategia". Es exactamente lo que se da de alta desde el panel web.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.scrape_targets (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references find_your_prices.stores (id) on delete cascade,

  name                 text not null,                       -- 'Diunsa - Jugueteria'
  kind                 find_your_prices.scrape_target_kind not null default 'category',

  -- Url publica de referencia. Sirve para que un humano entienda que se scrapea
  -- y, en estrategias basadas en html, es la url que realmente se descarga.
  url                  text,

  -- Estrategia especifica del target. Si es null se hereda stores.strategy_key.
  strategy_key         text,

  -- Parametros que la estrategia necesita: groupCode, selectores css, filtros,
  -- tamano de pagina, etc. Se mezcla sobre stores.config (el target gana).
  config               jsonb not null default '{}'::jsonb,

  -- Programacion. frequency_minutes es la fuente de verdad para el cron job;
  -- cron_expression queda disponible para agendas mas finas.
  frequency_minutes    integer check (frequency_minutes is null or frequency_minutes >= 1),
  cron_expression      text,
  priority             smallint not null default 100,       -- menor = se atiende primero
  max_pages            integer check (max_pages is null or max_pages > 0), -- tope de seguridad
  timezone             text not null default 'America/Tegucigalpa',

  -- Estado de planificacion, mantenido por el runner.
  next_run_at          timestamptz not null default now(),
  last_run_at          timestamptz,
  last_success_at      timestamptz,
  last_status          find_your_prices.scrape_run_status,
  consecutive_failures integer not null default 0,

  -- Circuit breaker: tras demasiados fallos seguidos el target se pausa solo.
  failure_threshold    integer not null default 5 check (failure_threshold > 0),
  is_active            boolean not null default true,
  paused_reason        text,

  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Evita registrar dos veces la misma url dentro de una tienda.
create unique index if not exists scrape_targets_store_url_key
  on find_your_prices.scrape_targets (store_id, url) where url is not null;

-- Indice que usa el planificador para elegir el proximo target a correr.
create index if not exists scrape_targets_due_idx
  on find_your_prices.scrape_targets (next_run_at, priority) where is_active;

create index if not exists scrape_targets_store_idx on find_your_prices.scrape_targets (store_id);

drop trigger if exists scrape_targets_set_updated_at on find_your_prices.scrape_targets;
create trigger scrape_targets_set_updated_at before update on find_your_prices.scrape_targets
  for each row execute function find_your_prices.set_updated_at();

comment on table find_your_prices.stores is 'Comercios cuyos precios se rastrean. Uno por sitio web.';
comment on table find_your_prices.scrape_targets is 'Unidades de trabajo del scraper: que url/listado se rastrea, con que estrategia y cada cuanto.';
comment on column find_your_prices.scrape_targets.config is 'Parametros libres de la estrategia. Se fusiona sobre stores.config; las claves del target tienen prioridad.';
comment on column find_your_prices.scrape_targets.next_run_at is 'Momento a partir del cual el target es elegible. El endpoint de cron selecciona targets con next_run_at <= now().';
