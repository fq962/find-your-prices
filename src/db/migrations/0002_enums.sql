-- =============================================================================
-- 0002_enums.sql
-- Tipos enumerados compartidos. Se aislan en su propia migracion porque en
-- Postgres agregar un valor a un enum (alter type ... add value) no puede
-- correr dentro del mismo bloque transaccional que lo usa.
-- =============================================================================

do $$
begin
  -- Como se obtiene la informacion de una tienda.
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'scrape_target_kind' and n.nspname = 'find_your_prices') then
    create type find_your_prices.scrape_target_kind as enum (
      'full_catalog',    -- toda la tienda de un solo golpe
      'category',        -- una categoria / listado paginado
      'search',          -- resultados de una busqueda
      'product_detail',  -- ficha individual de producto
      'sitemap',         -- descubrimiento de urls via sitemap.xml
      'feed'             -- feed estructurado (json/xml/csv) publicado por la tienda
    );
  end if;

  -- Estado del ciclo de vida de una ejecucion de scraping.
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'scrape_run_status' and n.nspname = 'find_your_prices') then
    create type find_your_prices.scrape_run_status as enum (
      'queued',   -- creada, aun no arranca
      'running',  -- en ejecucion
      'success',  -- termino sin errores
      'partial',  -- termino pero con paginas o items fallidos
      'failed',   -- aborto por error
      'skipped',  -- no corrio (lock activo, target inactivo, fuera de ventana)
      'cancelled' -- cancelada manualmente
    );
  end if;

  -- Quien disparo la ejecucion.
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'scrape_trigger' and n.nspname = 'find_your_prices') then
    create type find_your_prices.scrape_trigger as enum ('cron', 'manual', 'api', 'backfill');
  end if;

  -- Disponibilidad normalizada de un producto en una tienda.
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'availability_status' and n.nspname = 'find_your_prices') then
    create type find_your_prices.availability_status as enum (
      'in_stock',
      'out_of_stock',
      'preorder',
      'backorder',
      'limited',       -- quedan pocas unidades
      'discontinued',
      'unknown'
    );
  end if;

  -- Estado fisico del articulo (relevante en marketplaces y liquidaciones).
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'product_condition' and n.nspname = 'find_your_prices') then
    create type find_your_prices.product_condition as enum ('new', 'used', 'refurbished', 'open_box', 'damaged', 'unknown');
  end if;

  -- Como se dedujo que un store_product corresponde a un product canonico.
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'match_method' and n.nspname = 'find_your_prices') then
    create type find_your_prices.match_method as enum (
      'gtin',        -- codigo de barras identico (la senal mas fuerte)
      'mpn',         -- part number del fabricante
      'sku',
      'name_brand',  -- similitud de nombre + misma marca
      'fuzzy_name',  -- similitud de nombre por trigramas
      'embedding',   -- similitud semantica
      'manual'       -- revisado por una persona
    );
  end if;

  -- Ciclo de revision de un emparejamiento propuesto.
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'match_status' and n.nspname = 'find_your_prices') then
    create type find_your_prices.match_status as enum ('pending', 'approved', 'rejected', 'auto_approved');
  end if;
end
$$;
