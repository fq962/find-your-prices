-- =============================================================================
-- 0030_catalog_materialized.sql
-- El catálogo público pasa a leerse de una vista MATERIALIZADA.
--
-- Por qué. `v_store_products_current` une cinco tablas y cada lectura del
-- catálogo —cada búsqueda, cada `count(*)` del total, los relacionados de cada
-- ficha— rehace esos joins sobre ~83 000 artículos. Con los rastreadores
-- recorriendo decenas de miles de fichas y el CPU de Supabase al límite, la
-- cuenta ya no cierra: la vista se calcula miles de veces al día para servir
-- datos que solo cambian cuando corre el scraping (decenas de veces al día).
--
-- Qué cambia. `mv_catalog` guarda el resultado de la vista como una tabla
-- plana con sus índices propios. Las lecturas pasan a ser de una sola tabla.
-- El costo se muda al refresco: `refresh materialized view concurrently`, que
-- recomputa la vista entera y aplica el diff sin bloquear lecturas. Lo dispara
-- el runner al terminar una tanda con cambios, y un pg_cron de respaldo cada
-- 30 minutos que solo actúa si algo cambió desde el último refresco.
--
-- Espacio. Medido el 2026-09-16: 83 088 artículos activos, ~0.7 KB por fila
-- más índices ≈ 100–120 MB. Escala lineal con el catálogo; el plan tiene 8 GB.
--
-- `v_store_products_current` sigue existiendo como definición de referencia y
-- fuente de la materializada; la app ya no la lee directamente.
--
-- Idempotente: se puede volver a ejecutar sin duplicar nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La materializada.
--
-- Mismas columnas y en el mismo orden que `v_store_products_current` (0026),
-- más dos al final que las facetas necesitan: `store_category_id` y
-- `category_id`. Se escribe el select explícito y no `select * from la vista`
-- para que un `create or replace view` futuro no cambie la materializada por
-- debajo sin que nadie lo note: si cambia la vista, hay que cambiar esto.
-- -----------------------------------------------------------------------------
create materialized view if not exists find_your_prices.mv_catalog as
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
  sp.normalized_name,
  sp.store_category_id,
  sc.category_id
from find_your_prices.store_products sp
join find_your_prices.stores s on s.id = sp.store_id
left join find_your_prices.brands b on b.id = sp.brand_id
left join find_your_prices.store_categories sc on sc.id = sp.store_category_id
left join find_your_prices.categories c on c.id = sc.category_id
left join find_your_prices.categories cr on cr.id = coalesce(c.parent_id, c.id)
where sp.is_active and s.is_active
with data;

comment on materialized view find_your_prices.mv_catalog is
  'Copia plana e indexada de v_store_products_current. La lee el catalogo publico. Se refresca con refresh_catalog() al terminar el scraping y por pg_cron si algo cambio.';

-- -----------------------------------------------------------------------------
-- 2. Índices.
--
-- El único sobre `id` es obligatorio: `refresh ... concurrently` lo usa para
-- calcular el diff. El resto replica lo que las consultas de `catalog.ts`
-- filtran y ordenan. Ninguno es parcial: la materializada ya solo contiene
-- activos.
-- -----------------------------------------------------------------------------
create unique index if not exists mv_catalog_id_key
  on find_your_prices.mv_catalog (id);

-- Búsqueda por palabras (0026). PostgREST genera exactamente esta expresión.
create index if not exists mv_catalog_name_fts_idx
  on find_your_prices.mv_catalog using gin (to_tsvector('simple', normalized_name));

-- Ficha por slug (getProductDetail sigue en store_products, pero los
-- relacionados y cualquier lookup futuro lo usan).
create unique index if not exists mv_catalog_public_slug_key
  on find_your_prices.mv_catalog (public_slug) where public_slug is not null;

-- Facetas del catálogo.
create index if not exists mv_catalog_store_name_idx      on find_your_prices.mv_catalog (store_name);
create index if not exists mv_catalog_category_slug_idx   on find_your_prices.mv_catalog (category_slug);
create index if not exists mv_catalog_category_root_idx   on find_your_prices.mv_catalog (category_root_slug);
create index if not exists mv_catalog_store_category_idx  on find_your_prices.mv_catalog (store_category_name);
create index if not exists mv_catalog_brand_idx           on find_your_prices.mv_catalog (brand);

-- Órdenes del selector. `id` como segunda clave es el desempate que usa la
-- consulta, así el índice cubre el `order by` entero.
create index if not exists mv_catalog_newest_idx    on find_your_prices.mv_catalog (first_seen_at desc nulls last, id);
create index if not exists mv_catalog_discount_idx  on find_your_prices.mv_catalog (discount_percent desc nulls last, id);
create index if not exists mv_catalog_price_idx     on find_your_prices.mv_catalog (price, id);
create index if not exists mv_catalog_rating_idx    on find_your_prices.mv_catalog (rating_average desc nulls last, id);

-- Estadísticas frescas para que el planificador use los índices de arriba.
analyze find_your_prices.mv_catalog;

-- -----------------------------------------------------------------------------
-- 3. Bitácora del refresco. Una sola fila: cuándo fue el último y cuánto tardó.
-- El pg_cron la compara con `updated_at` de las tablas fuente para no
-- refrescar en vano.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.catalog_refresh_log (
  id               boolean primary key default true check (id),
  refreshed_at     timestamptz not null default now(),
  duration_ms      integer,
  triggered_by     text
);

insert into find_your_prices.catalog_refresh_log (id, refreshed_at, triggered_by)
values (true, now(), '0030')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. refresh_catalog(): la única forma de refrescar.
--
-- `security definer` porque la materializada es de `postgres` y `refresh`
-- exige ser dueño; el runner llama con service_role. `search_path` fijo por
-- la regla de siempre con security definer.
--
-- `concurrently` no bloquea a los lectores; a cambio no puede correr dentro
-- de una transacción que ya tenga la materializada abierta, y dos refrescos
-- a la vez se serializan solos.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.refresh_catalog(p_triggered_by text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = find_your_prices, pg_catalog
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_ms      integer;
begin
  refresh materialized view concurrently find_your_prices.mv_catalog;

  v_ms := (extract(epoch from clock_timestamp() - v_started) * 1000)::integer;

  insert into find_your_prices.catalog_refresh_log (id, refreshed_at, duration_ms, triggered_by)
  values (true, now(), v_ms, p_triggered_by)
  on conflict (id) do update set
    refreshed_at = excluded.refreshed_at,
    duration_ms  = excluded.duration_ms,
    triggered_by = excluded.triggered_by;

  return jsonb_build_object('refreshed_at', now(), 'duration_ms', v_ms, 'triggered_by', p_triggered_by);
end;
$$;

-- El runner llama a refresh_catalog() por PostgREST como service_role, y
-- Supabase le fija a ese rol un statement_timeout corto (8 s por defecto).
-- Un refresco de ~85k filas con sus índices puede pasar de eso; si el rol no
-- se puede alterar, el error queda en el log del runner y el pg_cron (que
-- corre como postgres) lo cubre en la siguiente media hora.
do $$
begin
  alter role service_role set statement_timeout = '5min';
exception when others then
  raise notice 'No se pudo subir statement_timeout de service_role (%): si refresh_catalog() supera el límite, subirlo a mano.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 5. refresh_catalog_if_stale(): lo que corre el pg_cron.
--
-- Solo refresca si alguna tabla fuente cambió después del último refresco.
-- Cubre lo que el runner no ve: desactivar una tienda desde el panel, cambiar
-- un mapeo de categoría, editar una marca. Cuando el runner ya refrescó, la
-- comparación falla y no cuesta más que cuatro `max()` sobre índices.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.refresh_catalog_if_stale()
returns jsonb
language plpgsql
security definer
set search_path = find_your_prices, pg_catalog
as $$
declare
  v_last   timestamptz;
  v_latest timestamptz;
begin
  select refreshed_at into v_last from find_your_prices.catalog_refresh_log where id;

  select greatest(
    (select max(updated_at) from find_your_prices.store_products),
    (select max(updated_at) from find_your_prices.stores),
    (select max(updated_at) from find_your_prices.store_categories),
    (select max(updated_at) from find_your_prices.categories),
    (select max(updated_at) from find_your_prices.brands)
  ) into v_latest;

  if v_last is null or v_latest is null or v_latest > v_last then
    return find_your_prices.refresh_catalog('cron');
  end if;

  return jsonb_build_object('skipped', true, 'refreshed_at', v_last);
end;
$$;

-- `max(updated_at)` sobre store_products sin índice sería un barrido de 100k
-- filas cada 30 minutos: exactamente lo que se quiere evitar.
create index if not exists store_products_updated_at_idx
  on find_your_prices.store_products (updated_at desc);

-- -----------------------------------------------------------------------------
-- 6. Permisos.
--
-- La materializada es pública de lectura, igual que la vista que reemplaza
-- (0010/0012): no expone nada que el catálogo no muestre. Las funciones de
-- refresco son solo para service_role: un anónimo que pudiera dispararlas
-- tendría un botón de "gastá CPU" gratis.
-- -----------------------------------------------------------------------------
grant select on find_your_prices.mv_catalog to anon, authenticated, service_role;
grant select on find_your_prices.catalog_refresh_log to service_role;
revoke all on find_your_prices.catalog_refresh_log from anon, authenticated;

revoke all on function find_your_prices.refresh_catalog(text) from public, anon, authenticated;
grant execute on function find_your_prices.refresh_catalog(text) to service_role;
revoke all on function find_your_prices.refresh_catalog_if_stale() from public, anon, authenticated;
grant execute on function find_your_prices.refresh_catalog_if_stale() to service_role;

-- -----------------------------------------------------------------------------
-- 7. Las facetas leen de la materializada.
--
-- Mismas columnas, mismos tipos y mismo piso de disponibilidad que 0020/0024;
-- solo cambia el `from`. `v_catalog_canonical_category_facets` no se toca:
-- necesita nivel, posición y padre del árbol de categorías, que no están en
-- la materializada, y ya corre solo cada cinco minutos desde la portada.
-- -----------------------------------------------------------------------------
create or replace view find_your_prices.v_catalog_store_facets as
select
  m.store_id,
  m.store_slug,
  m.store_name,
  m.store_logo_url            as logo_url,
  count(*)                    as product_count,
  count(*) filter (where m.list_price is not null) as discounted_count,
  min(m.price)                as min_price,
  max(m.price)                as max_price
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued')
group by m.store_id, m.store_slug, m.store_name, m.store_logo_url;

create or replace view find_your_prices.v_catalog_brand_facets as
select
  m.brand                        as brand_name,
  count(*)                       as product_count,
  min(m.price)                   as min_price,
  max(m.price)                   as max_price
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued')
  and m.brand is not null
group by m.brand
having count(*) >= 2;

create or replace view find_your_prices.v_catalog_summary as
select
  count(*)                                          as total_products,
  count(distinct m.store_id)                        as total_stores,
  count(distinct m.category_id)                     as total_categories,
  count(*) filter (where m.list_price is not null)  as discounted_products,
  count(*) filter (where m.in_stock)                as in_stock_products,
  min(m.price)                                      as min_price,
  max(m.price)                                      as max_price,
  max(m.last_seen_at)                               as last_seen_at
from find_your_prices.mv_catalog m
where m.price > 0
  and m.availability not in ('out_of_stock', 'discontinued');

-- -----------------------------------------------------------------------------
-- 8. pg_cron de respaldo, cada 30 minutos.
--
-- En Supabase la extensión se habilita desde Database → Extensions (o con el
-- `create extension` de abajo, que necesita permisos de superusuario y por
-- eso va protegido). Si no está disponible, la migración avisa y sigue: el
-- runner refresca igual y solo se pierde el respaldo para cambios manuales.
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron no se pudo habilitar (%): activarlo desde Database → Extensions y volver a correr esta sección.', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Se reemplaza si ya existía, para que la migración sea repetible.
    perform cron.unschedule(jobid) from cron.job where jobname = 'fyp_refresh_catalog_if_stale';
    perform cron.schedule(
      'fyp_refresh_catalog_if_stale',
      '*/30 * * * *',
      $job$ select find_your_prices.refresh_catalog_if_stale(); $job$
    );
  else
    raise notice 'pg_cron no está instalado: no se programó el refresco de respaldo.';
  end if;
end $$;
