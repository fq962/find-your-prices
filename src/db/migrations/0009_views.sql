-- =============================================================================
-- 0009_views.sql
-- Vistas de lectura para el front y el panel. Encapsulan los joins recurrentes
-- para que la app no repita la misma consulta en cinco lugares.
-- =============================================================================

-- Oferta vigente con los nombres ya resueltos: lo que consume el catalogo publico.
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
  sp.last_price_change_at
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
where sp.is_active and s.is_active;

-- Bajadas de precio recientes: alimenta la portada y las alertas.
create or replace view find_your_prices.v_recent_price_drops as
select
  ph.id,
  ph.scraped_at,
  ph.store_product_id,
  sp.name       as product_name,
  sp.url,
  sp.primary_image_url,
  s.slug        as store_slug,
  s.name        as store_name,
  ph.currency,
  ph.previous_price,
  ph.price,
  ph.price_delta,
  ph.price_delta_pct
from find_your_prices.price_history ph
join find_your_prices.store_products sp on sp.id = ph.store_product_id
join find_your_prices.stores s on s.id = ph.store_id
where ph.price_delta < 0
  and sp.is_active
order by ph.scraped_at desc;

-- Comparativa entre tiendas de un mismo producto canonico.
create or replace view find_your_prices.v_product_price_comparison as
select
  p.id            as product_id,
  p.canonical_name,
  p.primary_image_url,
  sp.store_id,
  s.slug          as store_slug,
  s.name          as store_name,
  sp.id           as store_product_id,
  sp.url,
  sp.currency,
  sp.price,
  sp.list_price,
  sp.availability,
  sp.in_stock,
  rank() over (partition by p.id order by sp.price asc nulls last) as price_rank
from find_your_prices.products p
join find_your_prices.store_products sp on sp.product_id = p.id
join find_your_prices.stores s on s.id = sp.store_id
where sp.is_active and s.is_active and sp.price is not null;

-- Salud del scraping: es la tabla principal del panel de administracion.
create or replace view find_your_prices.v_scrape_target_health as
select
  t.id                as target_id,
  t.name              as target_name,
  t.kind,
  t.url,
  t.is_active,
  t.frequency_minutes,
  t.next_run_at,
  t.last_run_at,
  t.last_success_at,
  t.last_status,
  t.consecutive_failures,
  t.paused_reason,
  s.id                as store_id,
  s.slug              as store_slug,
  s.name              as store_name,
  coalesce(t.strategy_key, s.strategy_key) as strategy_key,
  r.id                as last_run_id,
  r.duration_ms       as last_duration_ms,
  r.items_found       as last_items_found,
  r.items_new         as last_items_new,
  r.items_updated     as last_items_updated,
  r.price_changes     as last_price_changes,
  r.error_message     as last_error_message,
  (select count(*) from find_your_prices.store_products sp
    where sp.store_id = s.id and sp.is_active) as store_active_products
from find_your_prices.scrape_targets t
join find_your_prices.stores s on s.id = t.store_id
left join lateral (
  select * from find_your_prices.scrape_runs sr
  where sr.target_id = t.id
  order by sr.started_at desc
  limit 1
) r on true;

comment on view find_your_prices.v_store_products_current is 'Oferta activa con tienda, marca y categoria resueltas. Base del catalogo publico.';
comment on view find_your_prices.v_recent_price_drops is 'Historico filtrado a bajadas de precio, mas reciente primero.';
comment on view find_your_prices.v_product_price_comparison is 'Mismo producto canonico en varias tiendas, ordenado por precio.';
comment on view find_your_prices.v_scrape_target_health is 'Estado y ultimo resultado de cada target. Consulta principal del panel.';
