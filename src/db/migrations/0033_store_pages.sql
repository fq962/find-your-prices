-- =============================================================================
-- 0033_store_pages.sql
-- Páginas de tienda: imagen de cada comercio, facetas tienda × categoría y
-- facetas acotadas a (tienda, categoría) para el buscador de esas landings.
--
-- Por qué. Después de las fichas y las categorías, la tercera familia de
-- búsquedas anchas es la que nombra a la tienda: "abarrotes pricesmart",
-- "televisores diunsa precio". Ninguna página respondía eso. Cada tienda pasa
-- a tener su landing (`/tiendas/<tienda>`) y, colgando de ella, una por cada
-- categoría que la tienda de verdad vende (`/tiendas/<tienda>/<categoría>`):
-- "Abarrotes en PriceSmart". Solo se enlazan las combinaciones con artículos;
-- "Abarrotes en Okashi" no existe y no se publica.
--
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Imagen de la tienda.
--
-- `logo_url` ya existía desde 0003 y es lo que la landing muestra: se
-- reutiliza en lugar de inventar una columna gemela. Se agrega el texto
-- alternativo, que es lo que le faltaba para ser una imagen de página y no
-- solo un logo.
-- -----------------------------------------------------------------------------
alter table find_your_prices.stores
  add column if not exists image_alt text;

-- -----------------------------------------------------------------------------
-- 2. Qué categorías tiene cada tienda, con conteo directo.
--
-- Una fila por (tienda, nodo canónico) con al menos un artículo comprable.
-- El conteo es directo (artículos apuntando a ESE nodo); el de una raíz lo
-- suma el servicio, igual que con `v_catalog_canonical_category_facets`.
-- Lee de la materializada: se recalcula por render ISR, no por visitante.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_store_category_facets as
select
  m.store_slug,
  m.category_slug        as slug,
  count(*)               as product_count,
  count(*) filter (where m.list_price is not null) as discounted_count
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued')
  and m.category_slug is not null
group by m.store_slug, m.category_slug;

comment on view find_your_prices.v_catalog_store_category_facets is
  'Nodos canonicos con al menos un articulo comprable, por tienda. Fuente de las landings tienda x categoria.';

do $$
begin
  if current_setting('server_version_num')::integer >= 150000 then
    execute 'alter view find_your_prices.v_catalog_store_category_facets set (security_invoker = on)';
  end if;
end $$;

grant select on find_your_prices.v_catalog_store_category_facets to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Facetas acotadas a una tienda y, opcionalmente, a una categoría.
--
-- Misma forma que `catalog_category_facets` (0031) para que el servicio las
-- lea con el mismo código. `p_slug` null = toda la tienda. Sin `stores`: la
-- tienda es fija y el panel no la ofrece.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.catalog_store_facets(p_store_slug text, p_slug text default null)
returns jsonb
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  with scope as (
    select *
    from find_your_prices.mv_catalog m
    where m.store_slug = p_store_slug
      and (p_slug is null or m.category_slug = p_slug or m.category_root_slug = p_slug)
      and m.price > 0
      and m.availability not in ('out_of_stock', 'discontinued')
  )
  select jsonb_build_object(
    'total', (select count(*) from scope),
    'discounted', (select count(*) from scope where list_price is not null),
    'minPrice', (select coalesce(min(price), 0) from scope),
    'maxPrice', (select coalesce(max(price), 0) from scope),
    'stores', '[]'::jsonb,
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('value', brand, 'count', n) order by n desc)
      from (
        select brand, count(*) as n from scope
        where brand is not null
        group by brand having count(*) >= 2
        order by count(*) desc limit 300
      ) b
    ), '[]'::jsonb),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('slug', category_slug, 'count', n) order by n desc)
      from (
        select category_slug, count(*) as n from scope
        where category_slug is not null and (p_slug is null or category_slug <> p_slug)
        group by category_slug
      ) c
    ), '[]'::jsonb)
  );
$$;

grant execute on function find_your_prices.catalog_store_facets(text, text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Bucket de Storage para las imágenes de tienda. Igual que
-- `category-images` (0031): público de lectura, subida desde el panel.
-- -----------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'store-images',
    'store-images',
    true,
    5242880, -- 5 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'store_images_public_read'
  ) then
    create policy store_images_public_read on storage.objects
      for select using (bucket_id = 'store-images');
  end if;
exception when others then
  raise notice 'No se pudo crear el bucket store-images desde SQL (%): crearlo desde Storage → New bucket, público.', sqlerrm;
end $$;
