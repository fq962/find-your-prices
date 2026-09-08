-- =============================================================================
-- 0001_schema_init.sql
-- Crea el esquema base, extensiones y utilidades compartidas.
-- Ejecutar PRIMERO. Es idempotente: se puede correr varias veces sin romper nada.
-- =============================================================================

create schema if not exists find_your_prices;

-- pgcrypto -> gen_random_uuid()
create extension if not exists pgcrypto with schema public;
-- unaccent + pg_trgm -> normalizacion y busqueda difusa de nombres de productos
create extension if not exists unaccent with schema public;
create extension if not exists pg_trgm with schema public;

-- -----------------------------------------------------------------------------
-- Trigger generico: mantiene updated_at al dia en cualquier tabla que lo use.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Normaliza un texto libre a una forma comparable entre tiendas:
-- minusculas, sin acentos, sin signos, espacios colapsados.
-- Se usa para emparejar productos de distintos comercios.
-- IMMUTABLE para poder usarse en columnas generadas e indices.
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.normalize_text(input text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(lower(public.unaccent(coalesce(input, ''))), '[^a-z0-9]+', ' ', 'g'),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- -----------------------------------------------------------------------------
-- Convierte texto a slug url-safe (para tiendas, marcas y categorias).
-- -----------------------------------------------------------------------------
create or replace function find_your_prices.slugify(input text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(trim(both '-' from replace(find_your_prices.normalize_text(input), ' ', '-')), '');
$$;

comment on schema find_your_prices is
  'Esquema unico del proyecto Find Your Prices: catalogo multi-tienda, historico de precios y motor de scraping.';
