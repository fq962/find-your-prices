-- =============================================================================
-- 0007_matching.sql
-- Emparejamiento entre la oferta de una tienda (store_products) y el producto
-- canonico (products). Es lo que convierte "8000 filas de Diunsa" en
-- "comparar el mismo articulo en cinco tiendas".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- product_match_candidates: propuesta de emparejamiento con su nivel de
-- confianza. Los matches por codigo de barras se auto-aprueban; los difusos
-- quedan 'pending' esperando revision desde el panel.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.product_match_candidates (
  id                uuid primary key default gen_random_uuid(),
  store_product_id  uuid not null references find_your_prices.store_products (id) on delete cascade,
  product_id        uuid not null references find_your_prices.products (id) on delete cascade,

  confidence        numeric(5,4) not null check (confidence between 0 and 1),
  matched_by        find_your_prices.match_method not null,
  status            find_your_prices.match_status not null default 'pending',

  -- Que sustento tuvo la propuesta: {"gtin":"193052047373","name_similarity":0.87}
  evidence          jsonb not null default '{}'::jsonb,

  reviewed_at       timestamptz,
  reviewed_by       text,        -- email o id de quien reviso; texto hasta que exista tabla de usuarios
  review_notes      text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint product_match_candidates_unique unique (store_product_id, product_id)
);

create index if not exists product_match_pending_idx
  on find_your_prices.product_match_candidates (status, confidence desc) where status = 'pending';
create index if not exists product_match_store_product_idx
  on find_your_prices.product_match_candidates (store_product_id);
create index if not exists product_match_product_idx
  on find_your_prices.product_match_candidates (product_id);

drop trigger if exists product_match_candidates_set_updated_at on find_your_prices.product_match_candidates;
create trigger product_match_candidates_set_updated_at before update on find_your_prices.product_match_candidates
  for each row execute function find_your_prices.set_updated_at();

comment on table find_your_prices.product_match_candidates is
  'Propuestas de union entre la oferta de una tienda y un producto canonico, con confianza y estado de revision.';
