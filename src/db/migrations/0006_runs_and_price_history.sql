-- =============================================================================
-- 0006_runs_and_price_history.sql
-- Trazabilidad del scraping (que corrio, cuando, con que resultado) y la serie
-- temporal de precios, que es el activo de largo plazo del proyecto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- scrape_runs: una ejecucion de un target. Se crea en estado 'running' antes de
-- tocar la red y se cierra al final, pase lo que pase.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.scrape_runs (
  id                 uuid primary key default gen_random_uuid(),
  target_id          uuid references find_your_prices.scrape_targets (id) on delete set null,
  store_id           uuid not null references find_your_prices.stores (id) on delete cascade,

  strategy_key       text not null,
  status             find_your_prices.scrape_run_status not null default 'running',
  trigger_source     find_your_prices.scrape_trigger not null default 'cron',

  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  duration_ms        integer,

  -- Contadores de resultado. Alimentan el panel y los graficos de salud.
  pages_fetched      integer not null default 0,
  items_found        integer not null default 0,
  items_new          integer not null default 0,
  items_updated      integer not null default 0,
  items_unchanged    integer not null default 0,
  items_failed       integer not null default 0,
  items_delisted     integer not null default 0,
  price_changes      integer not null default 0,

  -- Telemetria de red, util para detectar bloqueos o cambios en el sitio.
  http_requests      integer not null default 0,
  http_errors        integer not null default 0,
  bytes_downloaded   bigint not null default 0,

  error_message      text,
  -- Errores detallados: [{"stage":"fetch","page":3,"message":"..."}]
  error_log          jsonb not null default '[]'::jsonb,
  -- Metricas libres que aporte la estrategia (totalItems reportado, etc).
  stats              jsonb not null default '{}'::jsonb,

  created_at         timestamptz not null default now()
);

create index if not exists scrape_runs_target_idx on find_your_prices.scrape_runs (target_id, started_at desc);
create index if not exists scrape_runs_store_idx on find_your_prices.scrape_runs (store_id, started_at desc);
create index if not exists scrape_runs_status_idx on find_your_prices.scrape_runs (status, started_at desc);
-- Garantiza que un mismo target no corra dos veces en paralelo (lock a nivel de datos).
create unique index if not exists scrape_runs_one_active_per_target
  on find_your_prices.scrape_runs (target_id) where status = 'running';

-- FK diferida desde store_products, declarada aqui porque scrape_runs se crea despues.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'store_products_last_scrape_run_fk'
  ) then
    alter table find_your_prices.store_products
      add constraint store_products_last_scrape_run_fk
      foreign key (last_scrape_run_id)
      references find_your_prices.scrape_runs (id) on delete set null;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- price_history: serie temporal. Se inserta una fila SOLO cuando algo del precio
-- o la disponibilidad cambia respecto a la ultima observacion; asi el historico
-- crece con la senal y no con la frecuencia del cron.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.price_history (
  id                bigint generated always as identity primary key,
  store_product_id  uuid not null references find_your_prices.store_products (id) on delete cascade,
  store_id          uuid not null references find_your_prices.stores (id) on delete cascade,
  scrape_run_id     uuid references find_your_prices.scrape_runs (id) on delete set null,

  currency          char(3) not null,
  price             numeric(14,2),
  list_price        numeric(14,2),
  discount_percent  numeric(5,2),
  member_price      numeric(14,2),
  promo_price       numeric(14,2),

  availability      find_your_prices.availability_status not null default 'unknown',
  in_stock          boolean,
  stock_quantity    integer,

  -- Delta contra la observacion anterior. Se calcula al insertar para no tener
  -- que hacer window functions en cada consulta del front.
  previous_price    numeric(14,2),
  price_delta       numeric(14,2),
  price_delta_pct   numeric(7,2),

  scraped_at        timestamptz not null default now()
);

create index if not exists price_history_product_time_idx
  on find_your_prices.price_history (store_product_id, scraped_at desc);
create index if not exists price_history_store_time_idx
  on find_your_prices.price_history (store_id, scraped_at desc);
create index if not exists price_history_run_idx on find_your_prices.price_history (scrape_run_id);
-- Acelera "bajadas de precio de hoy" en la portada.
create index if not exists price_history_drops_idx
  on find_your_prices.price_history (scraped_at desc) where price_delta < 0;

comment on table find_your_prices.scrape_runs is 'Bitacora de ejecuciones del scraper, con contadores y errores por corrida.';
comment on table find_your_prices.price_history is 'Serie temporal de precio y disponibilidad. Solo se inserta cuando hay cambio real.';
comment on column find_your_prices.price_history.price_delta is 'Diferencia contra la observacion anterior; negativo = bajo de precio.';
