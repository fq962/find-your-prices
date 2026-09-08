-- =============================================================================
-- 0004_catalog.sql
-- Catalogo canonico: marcas, arbol de categorias propio, mapeo de las
-- categorias crudas de cada tienda y el producto canonico que unifica la misma
-- cosa vendida en varios comercios.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- brands: marca unificada. Cada tienda escribe la marca a su manera
-- ('X- SHOT', 'X-Shot', 'XSHOT'); aqui vive la version canonica.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.brands (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  normalized_name  text generated always as (find_your_prices.normalize_text(name)) stored,
  logo_url         text,
  website_url      text,
  aliases          text[] not null default '{}',  -- variantes vistas en tiendas, ya normalizadas
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists brands_normalized_name_idx on find_your_prices.brands (normalized_name);
create index if not exists brands_name_trgm_idx on find_your_prices.brands using gin (normalized_name public.gin_trgm_ops);

drop trigger if exists brands_set_updated_at on find_your_prices.brands;
create trigger brands_set_updated_at before update on find_your_prices.brands
  for each row execute function find_your_prices.set_updated_at();

-- -----------------------------------------------------------------------------
-- categories: arbol de categorias propio del sitio, independiente de como
-- categorice cada tienda. Es lo que ve el usuario final al navegar precios.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.categories (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references find_your_prices.categories (id) on delete set null,
  slug         text not null unique,
  name         text not null,
  description  text,
  icon         text,
  -- Ruta legible desde la raiz: 'jugueteria/munecas'. Se mantiene desde la app.
  path         text,
  level        smallint not null default 0 check (level >= 0),
  position     integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists categories_parent_idx on find_your_prices.categories (parent_id);
create index if not exists categories_path_idx on find_your_prices.categories (path);

drop trigger if exists categories_set_updated_at on find_your_prices.categories;
create trigger categories_set_updated_at before update on find_your_prices.categories
  for each row execute function find_your_prices.set_updated_at();

-- -----------------------------------------------------------------------------
-- store_categories: el arbol tal cual lo publica la tienda, sin tocar.
-- Se guarda completo porque es la llave para paginar (ej. groupCode 258 en
-- Diunsa) y porque permite remapear a categories sin volver a scrapear.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.store_categories (
  id                   uuid primary key default gen_random_uuid(),
  store_id             uuid not null references find_your_prices.stores (id) on delete cascade,

  external_id          text not null,   -- id/codigo de la categoria en la tienda ('258')
  external_parent_id   text,            -- codigo del padre en la tienda
  parent_id            uuid references find_your_prices.store_categories (id) on delete set null,

  name                 text not null,   -- 'Jugueteria'
  slug                 text,
  url                  text,
  level                smallint not null default 0,
  position             integer,
  product_count        integer,         -- ultimo conteo reportado por la tienda

  -- Mapeo hacia el arbol canonico. Null = aun sin clasificar.
  category_id          uuid references find_your_prices.categories (id) on delete set null,

  raw                  jsonb not null default '{}'::jsonb,  -- payload original de la tienda
  is_active            boolean not null default true,
  last_seen_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint store_categories_store_external_key unique (store_id, external_id)
);

create index if not exists store_categories_store_idx on find_your_prices.store_categories (store_id);
create index if not exists store_categories_category_idx on find_your_prices.store_categories (category_id);
create index if not exists store_categories_parent_idx on find_your_prices.store_categories (parent_id);

drop trigger if exists store_categories_set_updated_at on find_your_prices.store_categories;
create trigger store_categories_set_updated_at before update on find_your_prices.store_categories
  for each row execute function find_your_prices.set_updated_at();

-- -----------------------------------------------------------------------------
-- products: producto canonico. Un iPhone 15 128GB es UNA fila aqui, aunque
-- aparezca en cinco tiendas. Es lo que permite comparar precios.
-- Se puebla por emparejamiento (ver 0007_matching.sql), no por el scraper.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique,
  canonical_name    text not null,
  normalized_name   text generated always as (find_your_prices.normalize_text(canonical_name)) stored,

  brand_id          uuid references find_your_prices.brands (id) on delete set null,
  category_id       uuid references find_your_prices.categories (id) on delete set null,

  model             text,
  part_number       text,               -- MPN del fabricante
  gtin              text,               -- codigo de barras normalizado a GTIN-14; identificador global mas fiable
  description       text,
  primary_image_url text,

  -- Atributos estructurados y comparables (capacidad, color, voltaje...).
  attributes        jsonb not null default '{}'::jsonb,
  -- Especificaciones tecnicas libres, tal como las publica el fabricante.
  specs             jsonb not null default '{}'::jsonb,

  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists products_gtin_key on find_your_prices.products (gtin) where gtin is not null;
create index if not exists products_brand_idx on find_your_prices.products (brand_id);
create index if not exists products_category_idx on find_your_prices.products (category_id);
create index if not exists products_name_trgm_idx on find_your_prices.products using gin (normalized_name public.gin_trgm_ops);

drop trigger if exists products_set_updated_at on find_your_prices.products;
create trigger products_set_updated_at before update on find_your_prices.products
  for each row execute function find_your_prices.set_updated_at();

comment on table find_your_prices.brands is 'Marcas unificadas entre tiendas.';
comment on table find_your_prices.categories is 'Arbol de categorias propio del sitio, visible al usuario final.';
comment on table find_your_prices.store_categories is 'Arbol de categorias crudo de cada tienda; llave de paginacion del scraper y puente hacia categories.';
comment on table find_your_prices.products is 'Producto canonico: la misma cosa vendida por varias tiendas colapsada en una fila.';
