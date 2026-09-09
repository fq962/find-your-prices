-- =============================================================================
-- 0017_view_first_seen.sql
-- Expone `first_seen_at` en la vista del catalogo publico.
--
-- Por que: el orden por defecto del sitio pasa a ser "recien agregados", y eso
-- necesita la fecha en que el articulo aparecio por primera vez. La columna ya
-- existe en `store_products` desde 0005; lo unico que faltaba era publicarla.
--
-- `last_seen_at` NO sirve para esto: se refresca en cada corrida del scraper,
-- asi que todo el catalogo comparte practicamente la misma fecha y el orden
-- resultante es ruido.
--
-- Se agrega al FINAL de la lista de columnas a proposito: `create or replace
-- view` solo admite columnas nuevas al final, y asi la vista se reemplaza sin
-- tener que soltar las vistas y los grants que dependen de ella.
-- =============================================================================

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
  sp.first_seen_at
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
where sp.is_active and s.is_active;

comment on view find_your_prices.v_store_products_current is 'Oferta activa con tienda, marca y categoria resueltas. Base del catalogo publico.';

-- Ordenar por novedad recorre la tabla entera sin este indice. `desc` porque
-- la consulta siempre pide lo mas nuevo primero.
create index if not exists store_products_first_seen_idx
  on find_your_prices.store_products (first_seen_at desc)
  where is_active;
