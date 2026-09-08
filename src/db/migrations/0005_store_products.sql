-- =============================================================================
-- 0005_store_products.sql
-- La oferta concreta de un producto en una tienda concreta: el corazon del
-- sistema. Una fila = "este articulo, en esta tienda, ahora".
--
-- El conjunto de columnas es deliberadamente amplio: cubre lo que publican
-- retailers de todo tipo (departamentales, ferreterias, farmacias, super,
-- marketplaces), no solo lo que hoy expone Diunsa. Un scraper llena lo que su
-- tienda ofrece y deja el resto en null; nunca hay que migrar la tabla al
-- agregar un comercio mas rico.
-- =============================================================================

create table if not exists find_your_prices.store_products (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references find_your_prices.stores (id) on delete cascade,

  -- Enlace al producto canonico. Null hasta que el matcher lo resuelva.
  product_id            uuid references find_your_prices.products (id) on delete set null,

  -- ---------------------------------------------------------------------------
  -- Identificadores
  -- ---------------------------------------------------------------------------
  external_id           text not null,   -- id primario del articulo en la tienda; llave de deduplicacion
  external_code         text,            -- segundo codigo interno (ej. code SAP de Diunsa)
  sku                   text,
  mpn                   text,            -- Manufacturer Part Number
  gtin                  text,            -- codigo de barras normalizado a GTIN-14
  barcode_raw           text,            -- el codigo tal como lo publico la tienda
  ean                   text,
  upc                   text,
  isbn                  text,            -- libros
  asin                  text,            -- marketplaces
  seller_name           text,            -- vendedor en marketplaces; null si vende la tienda
  seller_id             text,

  -- ---------------------------------------------------------------------------
  -- Contenido
  -- ---------------------------------------------------------------------------
  name                  text not null,
  normalized_name       text generated always as (find_your_prices.normalize_text(name)) stored,
  name_alias            text,            -- nombre corto/comercial alterno
  slug                  text,
  url                   text not null,   -- ficha publica del producto
  canonical_url         text,
  short_description     text,
  description           text,
  highlights            text[],          -- bullets de caracteristicas

  brand_raw             text,            -- marca tal cual la publica la tienda
  brand_id              uuid references find_your_prices.brands (id) on delete set null,
  manufacturer          text,
  model                 text,
  color                 text,
  size                  text,
  material              text,
  condition             find_your_prices.product_condition not null default 'new',
  is_adult              boolean not null default false,

  -- ---------------------------------------------------------------------------
  -- Clasificacion
  -- ---------------------------------------------------------------------------
  store_category_id     uuid references find_your_prices.store_categories (id) on delete set null,
  category_raw          text,            -- nombre de categoria tal cual lo da la tienda
  category_path         text[],          -- breadcrumb completo: {Hogar, Cocina, Ollas}
  tags                  text[],

  -- ---------------------------------------------------------------------------
  -- Precio actual (snapshot vigente; el historico vive en price_history)
  -- ---------------------------------------------------------------------------
  currency              char(3) not null default 'HNL',
  price                 numeric(14,2),   -- precio efectivo que paga el cliente hoy
  list_price            numeric(14,2),   -- precio de lista / tachado / antes
  discount_percent      numeric(5,2) check (discount_percent is null or discount_percent between 0 and 100),
  discount_amount       numeric(14,2),
  member_price          numeric(14,2),   -- precio con tarjeta/club de la tienda
  promo_price           numeric(14,2),   -- precio de promocion temporal distinto del regular
  installment_price     numeric(14,2),   -- valor de la cuota
  installment_count     smallint,
  min_price             numeric(14,2),   -- rango, cuando el articulo tiene variantes
  max_price             numeric(14,2),
  price_per_unit        numeric(14,4),   -- precio por unidad de medida (L/kg, L/litro)
  unit_measure_code     text,            -- 'UN', 'KG', 'LT'
  unit_measure_name     text,
  unit_amount           numeric(12,3),   -- contenido: 1.5 (litros), 500 (gramos)
  tax_rate              numeric(5,2),    -- % de impuesto aplicable
  tax_included          boolean not null default true,
  price_valid_until     timestamptz,     -- fin de vigencia de la promo, si se publica

  -- ---------------------------------------------------------------------------
  -- Disponibilidad
  -- ---------------------------------------------------------------------------
  availability          find_your_prices.availability_status not null default 'unknown',
  in_stock              boolean,
  stock_quantity        integer,
  min_order_quantity    integer,
  max_order_quantity    integer,
  -- Disponibilidad desagregada por sucursal/bodega:
  -- [{"code":"TGU-01","name":"Mall Multiplaza","quantity":4}]
  location_availability jsonb not null default '[]'::jsonb,

  -- ---------------------------------------------------------------------------
  -- Reputacion
  -- ---------------------------------------------------------------------------
  rating_average        numeric(3,2) check (rating_average is null or rating_average between 0 and 5),
  rating_count          integer,
  review_count          integer,

  -- ---------------------------------------------------------------------------
  -- Medios
  -- ---------------------------------------------------------------------------
  primary_image_url     text,
  image_count           integer not null default 0,
  video_urls            text[],

  -- ---------------------------------------------------------------------------
  -- Logistica y postventa
  -- ---------------------------------------------------------------------------
  has_free_shipping     boolean,
  shipping_cost         numeric(14,2),
  shipping_info         jsonb not null default '{}'::jsonb,  -- plazos, coberturas, retiro en tienda
  warranty_months       smallint,
  warranty_info         jsonb not null default '{}'::jsonb,  -- garantia base y extendida ofertada
  weight_grams          numeric(12,3),
  length_mm             numeric(12,2),
  width_mm              numeric(12,2),
  height_mm             numeric(12,2),

  -- ---------------------------------------------------------------------------
  -- Datos estructurados libres
  -- ---------------------------------------------------------------------------
  specs                 jsonb not null default '{}'::jsonb,  -- ficha tecnica clave/valor
  attributes            jsonb not null default '{}'::jsonb,  -- atributos normalizados por la app
  badges                text[],          -- 'liquidacion', 'nuevo', 'envio gratis'
  meta_title            text,
  meta_description      text,

  -- Payload original completo del scraper. Permite reprocesar sin re-scrapear
  -- cuando la normalizacion cambia.
  raw                   jsonb not null default '{}'::jsonb,

  -- ---------------------------------------------------------------------------
  -- Ciclo de vida
  -- ---------------------------------------------------------------------------
  -- Hash del contenido normalizado. Si no cambia, no se toca nada en el upsert
  -- salvo last_seen_at: asi un run de 8000 productos escribe solo lo que cambio.
  content_hash          text,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  last_scraped_at       timestamptz not null default now(),
  last_price_change_at  timestamptz,
  last_scrape_run_id    uuid,            -- FK diferida a scrape_runs (ver 0006)
  -- false cuando el producto dejo de aparecer en la tienda (delisted).
  is_active             boolean not null default true,
  delisted_at           timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint store_products_store_external_key unique (store_id, external_id)
);

create index if not exists store_products_store_idx on find_your_prices.store_products (store_id) where is_active;
create index if not exists store_products_product_idx on find_your_prices.store_products (product_id);
create index if not exists store_products_gtin_idx on find_your_prices.store_products (gtin) where gtin is not null;
create index if not exists store_products_brand_idx on find_your_prices.store_products (brand_id);
create index if not exists store_products_category_idx on find_your_prices.store_products (store_category_id);
create index if not exists store_products_price_idx on find_your_prices.store_products (currency, price) where is_active;
create index if not exists store_products_last_seen_idx on find_your_prices.store_products (store_id, last_seen_at);
create index if not exists store_products_unmatched_idx on find_your_prices.store_products (store_id) where product_id is null and is_active;
create index if not exists store_products_name_trgm_idx
  on find_your_prices.store_products using gin (normalized_name public.gin_trgm_ops);

drop trigger if exists store_products_set_updated_at on find_your_prices.store_products;
create trigger store_products_set_updated_at before update on find_your_prices.store_products
  for each row execute function find_your_prices.set_updated_at();

-- -----------------------------------------------------------------------------
-- store_product_images: galeria completa. Se separa en su propia tabla porque
-- un articulo puede traer decenas de imagenes y solo la principal se consulta
-- en los listados.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.store_product_images (
  id                uuid primary key default gen_random_uuid(),
  store_product_id  uuid not null references find_your_prices.store_products (id) on delete cascade,
  url               text not null,
  external_id       text,
  position          smallint not null default 0,
  is_primary        boolean not null default false,
  alt_text          text,
  width             integer,
  height            integer,
  created_at        timestamptz not null default now(),

  constraint store_product_images_unique unique (store_product_id, url)
);

create index if not exists store_product_images_product_idx
  on find_your_prices.store_product_images (store_product_id, position);

-- -----------------------------------------------------------------------------
-- store_product_variants: talla, color, capacidad. Cada variante puede tener su
-- propio precio, stock y codigo de barras.
-- -----------------------------------------------------------------------------
create table if not exists find_your_prices.store_product_variants (
  id                uuid primary key default gen_random_uuid(),
  store_product_id  uuid not null references find_your_prices.store_products (id) on delete cascade,

  external_id       text not null,
  sku               text,
  gtin              text,
  barcode_raw       text,
  name              text,
  color             text,
  size              text,
  capacity          text,

  -- Cualquier otro eje de variacion: {"voltaje": "220V"}
  options           jsonb not null default '{}'::jsonb,

  currency          char(3),
  price             numeric(14,2),
  list_price        numeric(14,2),
  availability      find_your_prices.availability_status not null default 'unknown',
  in_stock          boolean,
  stock_quantity    integer,
  image_url         text,

  raw               jsonb not null default '{}'::jsonb,
  is_active         boolean not null default true,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint store_product_variants_unique unique (store_product_id, external_id)
);

create index if not exists store_product_variants_product_idx
  on find_your_prices.store_product_variants (store_product_id);

drop trigger if exists store_product_variants_set_updated_at on find_your_prices.store_product_variants;
create trigger store_product_variants_set_updated_at before update on find_your_prices.store_product_variants
  for each row execute function find_your_prices.set_updated_at();

comment on table find_your_prices.store_products is 'Oferta vigente de un articulo en una tienda. Snapshot actual; el historico esta en price_history.';
comment on column find_your_prices.store_products.external_id is 'Identificador del articulo en la tienda. Junto a store_id forma la llave de deduplicacion del scraper.';
comment on column find_your_prices.store_products.content_hash is 'Hash del contenido normalizado; si no cambia entre corridas el upsert solo refresca last_seen_at.';
comment on column find_your_prices.store_products.raw is 'Payload original del scraper, para reprocesar sin volver a descargar el sitio.';
comment on table find_your_prices.store_product_images is 'Galeria de imagenes por articulo y tienda.';
comment on table find_your_prices.store_product_variants is 'Variantes (talla, color, capacidad) con precio y stock propios.';
