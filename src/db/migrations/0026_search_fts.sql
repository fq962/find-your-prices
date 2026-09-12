-- =============================================================================
-- 0026_search_fts.sql
-- Búsqueda por palabras: "play 5" encuentra "PlayStation 5" (prefijo + AND,
-- sin importar el orden).
--
-- Se usa full-text con la config 'simple' (sin stemming, respeta números)
-- sobre `normalized_name`, que ya viene sin acentos ni signos. El índice GIN
-- de tsvector guarda una entrada por palabra distinta: es mucho más liviano
-- que el de trigramas (una entrada por cada 3 letras).
-- =============================================================================

-- La vista publica normalized_name (al final: create or replace solo admite
-- columnas nuevas al final).
create or replace view find_your_prices.v_store_products_current as
select
  sp.id,
  sp.store_id,
  s.slug            as store_slug,
  s.name            as store_name,
  s.logo_url        as store_logo_url,
  sp.product_id,
  sp.external_id,
  sp.name,
  sp.url,
  sp.primary_image_url,
  coalesce(b.name, sp.brand_raw) as brand,
  sp.category_raw,
  sc.name           as store_category_name,
  c.slug            as category_slug,
  sp.currency,
  sp.price,
  sp.list_price,
  sp.discount_percent,
  sp.member_price,
  sp.availability,
  sp.in_stock,
  sp.stock_quantity,
  sp.rating_average,
  sp.rating_count,
  sp.gtin,
  sp.last_seen_at,
  sp.last_price_change_at,
  sp.first_seen_at,
  sp.public_slug,
  c.name            as category_name,
  cr.slug           as category_root_slug,
  cr.name           as category_root_name,
  sp.normalized_name
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
left join find_your_prices.categories cr on cr.id = coalesce(c.parent_id, c.id)
where sp.is_active and s.is_active;

-- Índice de expresión (no agrega columna). Parcial sobre activos: la vista ya
-- filtra is_active, así que el planificador lo usa igual y ocupa menos.
-- PostgREST genera exactamente `to_tsvector('simple', normalized_name) @@ ...`
-- para el filtro `fts(simple)`, que es lo que este índice cubre.
create index if not exists store_products_name_fts_idx
  on find_your_prices.store_products
  using gin (to_tsvector('simple', normalized_name))
  where is_active;

-- El trigram sobre store_products.normalized_name queda obsoleto para el
-- catálogo (ningún ilike lo usaba). Si nada más lo necesita:
--   drop index if exists find_your_prices.store_products_name_trgm_idx;
