-- =============================================================================
-- 0031_category_pages.sql
-- Páginas de categoría: imagen, texto SEO por idioma, categorías destacadas,
-- productos populares por clics y facetas acotadas a una categoría.
--
-- Por qué. El sitio tenía dos tipos de página indexable: la portada y las
-- fichas. Las fichas son decenas de miles pero compiten por búsquedas muy
-- concretas ("televisor samsung 55 crystal"); las categorías compiten por las
-- búsquedas anchas ("precios de televisores en honduras") que hoy no tienen
-- ninguna página que las responda. Cada categoría pasa a ser una landing con
-- su imagen, su texto y sus palabras clave, mantenida desde el panel.
--
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Imagen y destacado, en la propia categoría (no dependen del idioma).
--
-- `image_url` es la URL pública del objeto en Storage (bucket de abajo).
-- `featured_position` ordena la sección "populares"; null = no destacada.
-- Las populares se eligen a mano y no por clics a propósito: es una decisión
-- editorial (qué queremos empujar) y no puede quedar en manos de un pico de
-- tráfico de bots.
-- -----------------------------------------------------------------------------
alter table find_your_prices.categories
  add column if not exists image_url         text,
  add column if not exists image_alt         text,
  add column if not exists featured_position integer;

create index if not exists categories_featured_idx
  on find_your_prices.categories (featured_position)
  where featured_position is not null and is_active;

-- -----------------------------------------------------------------------------
-- 2. Texto SEO por idioma.
--
-- Una fila por (categoría, idioma). Todo opcional: la página se arma con lo
-- que haya y cae a la otra lengua o al nombre de la categoría. Los campos
-- son los que Google lee de verdad: título (<title> y H1 si se quiere
-- distinto del nombre), descripción (meta description, ~155 caracteres),
-- intro (párrafo bajo el H1), cuerpo (el bloque largo del final, en Markdown
-- sencillo: párrafos y ## subtítulos) y palabras clave.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.category_content (
  category_id      uuid not null references find_your_prices.categories (id) on delete cascade,
  locale           text not null check (locale in ('es', 'en')),
  title            text,
  meta_description text,
  intro            text,
  body             text,
  keywords         text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  primary key (category_id, locale)
);

drop trigger if exists category_content_set_updated_at on find_your_prices.category_content;
create trigger category_content_set_updated_at before update on find_your_prices.category_content
  for each row execute function find_your_prices.set_updated_at();

comment on table find_your_prices.category_content is
  'Texto SEO de cada categoria por idioma: titulo, meta description, intro, cuerpo (markdown simple) y palabras clave. Lo edita el panel.';

-- Lectura pública (es contenido de la página), escritura solo desde el panel
-- con service_role.
grant select on find_your_prices.category_content to anon, authenticated, service_role;
grant insert, update, delete on find_your_prices.category_content to service_role;
alter table find_your_prices.category_content enable row level security;
drop policy if exists category_content_public_read on find_your_prices.category_content;
create policy category_content_public_read on find_your_prices.category_content
  for select using (true);

-- -----------------------------------------------------------------------------
-- 3. Clics por producto.
--
-- Un contador en `store_products` y no una tabla de eventos: la pregunta que
-- se quiere responder es "cuáles son los más pedidos de esta categoría", y
-- para eso basta el total. Se cuenta cada vez que alguien abre la ficha o
-- sale hacia la tienda desde el catálogo.
-- -----------------------------------------------------------------------------
alter table find_your_prices.store_products
  add column if not exists click_count     integer not null default 0,
  add column if not exists last_clicked_at timestamptz;

-- Parcial: la inmensa mayoría tiene cero clics y no hace falta indexarla.
create index if not exists store_products_clicks_idx
  on find_your_prices.store_products (click_count desc, last_clicked_at desc)
  where click_count > 0 and is_active;

-- Se llama desde el navegador (anon) por la API del sitio. `security definer`
-- porque anon no tiene update sobre store_products, y así solo puede sumar
-- uno: nunca escribir un número arbitrario.
create or replace function find_your_prices.record_product_click(p_product_id uuid)
returns void
language sql
security definer
set search_path = find_your_prices, pg_catalog
as $$
  update find_your_prices.store_products
     set click_count = click_count + 1,
         last_clicked_at = now()
   where id = p_product_id
     and is_active;
$$;

revoke all on function find_your_prices.record_product_click(uuid) from public;
grant execute on function find_your_prices.record_product_click(uuid) to anon, authenticated, service_role;

-- El contador NO se copia a la materializada: cambia con cada clic y la
-- materializada solo se refresca con el scraping. Los populares se resuelven
-- en dos pasos desde la app (ids por clics, filas desde mv_catalog).

-- -----------------------------------------------------------------------------
-- 4. Facetas acotadas a una categoría, en una sola consulta.
--
-- La página de categoría pinta el mismo buscador de la portada pero dentro
-- de la categoría, y el panel de filtros tiene que contar lo que hay AHÍ:
-- las tiendas y marcas globales mentirían ("Walmart (12 000)" cuando en
-- Jardinería tiene 40). Un slug entra por las dos columnas, como en la
-- búsqueda: una raíz abarca a sus hijas.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.catalog_category_facets(p_slug text)
returns jsonb
language sql
stable
set search_path = find_your_prices, pg_catalog
as $$
  with scope as (
    select *
    from find_your_prices.mv_catalog m
    where (m.category_slug = p_slug or m.category_root_slug = p_slug)
      and m.price > 0
      and m.availability not in ('out_of_stock', 'discontinued')
  )
  select jsonb_build_object(
    'total', (select count(*) from scope),
    'discounted', (select count(*) from scope where list_price is not null),
    'minPrice', (select coalesce(min(price), 0) from scope),
    'maxPrice', (select coalesce(max(price), 0) from scope),
    'stores', coalesce((
      select jsonb_agg(jsonb_build_object('value', store_name, 'count', n) order by n desc)
      from (select store_name, count(*) as n from scope group by store_name) s
    ), '[]'::jsonb),
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
        where category_slug is not null and category_slug <> p_slug
        group by category_slug
      ) c
    ), '[]'::jsonb)
  );
$$;

grant execute on function find_your_prices.catalog_category_facets(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Bucket de Storage para las imágenes de categoría.
--
-- Público de lectura: las URLs van en el HTML y en el Open Graph. La subida
-- la hace el panel con service_role, que salta RLS. Crear el bucket desde
-- SQL necesita permisos sobre el esquema storage; si el editor no los tiene,
-- se crea a mano desde Storage → New bucket (nombre `category-images`,
-- público) y no pasa nada más.
-- -----------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'category-images',
    'category-images',
    true,
    5242880, -- 5 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
  )
  on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  -- Lectura anónima de los objetos del bucket (el bucket público ya la
  -- permite por URL directa; la política cubre el listado por API).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'category_images_public_read'
  ) then
    create policy category_images_public_read on storage.objects
      for select using (bucket_id = 'category-images');
  end if;
exception when others then
  raise notice 'No se pudo crear el bucket category-images desde SQL (%): crearlo desde Storage → New bucket, público.', sqlerrm;
end $$;
