/**
 * Contrato del sistema de scraping.
 *
 * Todo comercio nuevo (Ladylee, Radio Shack, La Curacao...) se agrega
 * implementando `ScrapeStrategy` y registrandola en `registry.ts`. Nada mas
 * cambia: ni la base de datos, ni el runner, ni el endpoint, ni el panel.
 */

// -----------------------------------------------------------------------------
// Enums espejo de los tipos de Postgres (ver src/db/migrations/0002_enums.sql).
// -----------------------------------------------------------------------------

export type ScrapeTargetKind =
  | 'full_catalog'
  | 'category'
  | 'search'
  | 'product_detail'
  | 'sitemap'
  | 'feed';

export type ScrapeRunStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'partial'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type ScrapeTrigger = 'cron' | 'manual' | 'api' | 'backfill';

export type AvailabilityStatus =
  | 'in_stock'
  | 'out_of_stock'
  | 'preorder'
  | 'backorder'
  | 'limited'
  | 'discontinued'
  | 'unknown';

export type ProductCondition = 'new' | 'used' | 'refurbished' | 'open_box' | 'damaged' | 'unknown';

// -----------------------------------------------------------------------------
// Filas de la base que el runner necesita.
// -----------------------------------------------------------------------------

export interface StoreRow {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  country_code: string;
  default_currency: string;
  default_locale: string;
  strategy_key: string;
  config: Record<string, unknown>;
  request_delay_ms: number;
  max_concurrency: number;
  request_timeout_ms: number;
  max_retries: number;
  user_agent: string | null;
  is_active: boolean;
}

export interface ScrapeTargetRow {
  id: string;
  store_id: string;
  name: string;
  kind: ScrapeTargetKind;
  url: string | null;
  strategy_key: string | null;
  config: Record<string, unknown>;
  frequency_minutes: number | null;
  max_pages: number | null;
  priority: number;
  /**
   * Origen de la rejilla horaria: todo `next_run_at` sano es
   * `schedule_anchor_at + k * frequency_minutes`. Null en targets anteriores a
   * la migracion 0023, que siguen reprogramandose desde el final de la corrida.
   */
  schedule_anchor_at: string | null;
  next_run_at: string;
  last_run_at: string | null;
  last_status: ScrapeRunStatus | null;
  consecutive_failures: number;
  failure_threshold: number;
  is_active: boolean;
}

// -----------------------------------------------------------------------------
// Producto normalizado: la moneda de cambio entre cualquier estrategia y la base.
//
// Los nombres coinciden 1:1 con las columnas de find_your_prices.store_products
// para que la funcion `ingest_store_products` los consuma sin traduccion.
// Todo es opcional salvo lo que identifica al articulo: una estrategia llena lo
// que su tienda publica y omite el resto.
// -----------------------------------------------------------------------------

export interface NormalizedImage {
  url: string;
  external_id?: string | null;
  position?: number | null;
  is_primary?: boolean | null;
  alt_text?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface NormalizedVariant {
  external_id: string;
  sku?: string | null;
  barcode_raw?: string | null;
  name?: string | null;
  color?: string | null;
  size?: string | null;
  capacity?: string | null;
  options?: Record<string, unknown>;
  currency?: string | null;
  price?: number | null;
  list_price?: number | null;
  availability?: AvailabilityStatus;
  in_stock?: boolean | null;
  stock_quantity?: number | null;
  image_url?: string | null;
}

export interface NormalizedProduct {
  // --- Identidad (obligatorio) ---
  external_id: string;
  name: string;
  url: string;

  // --- Otros identificadores ---
  external_code?: string | null;
  sku?: string | null;
  mpn?: string | null;
  gtin?: string | null;
  barcode_raw?: string | null;
  ean?: string | null;
  upc?: string | null;
  isbn?: string | null;
  asin?: string | null;
  seller_name?: string | null;
  seller_id?: string | null;

  // --- Contenido ---
  name_alias?: string | null;
  slug?: string | null;
  canonical_url?: string | null;
  short_description?: string | null;
  description?: string | null;
  highlights?: string[];
  brand_raw?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  color?: string | null;
  size?: string | null;
  material?: string | null;
  condition?: ProductCondition;
  is_adult?: boolean;

  // --- Clasificacion ---
  /** Id interno; normalmente lo resuelve el runner, no la estrategia. */
  store_category_id?: string | null;
  /** Codigo de categoria en la tienda. El runner lo traduce a store_category_id. */
  store_category_external_id?: string | null;
  category_raw?: string | null;
  category_path?: string[];
  tags?: string[];

  // --- Precio ---
  currency?: string;
  price?: number | null;
  list_price?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  member_price?: number | null;
  promo_price?: number | null;
  installment_price?: number | null;
  installment_count?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  price_per_unit?: number | null;
  unit_measure_code?: string | null;
  unit_measure_name?: string | null;
  unit_amount?: number | null;
  tax_rate?: number | null;
  tax_included?: boolean;
  price_valid_until?: string | null;

  // --- Disponibilidad ---
  availability?: AvailabilityStatus;
  in_stock?: boolean | null;
  stock_quantity?: number | null;
  min_order_quantity?: number | null;
  max_order_quantity?: number | null;
  location_availability?: unknown[];

  // --- Reputacion ---
  rating_average?: number | null;
  rating_count?: number | null;
  review_count?: number | null;

  // --- Medios ---
  primary_image_url?: string | null;
  images?: NormalizedImage[];
  video_urls?: string[];

  // --- Logistica y postventa ---
  has_free_shipping?: boolean | null;
  shipping_cost?: number | null;
  shipping_info?: Record<string, unknown>;
  warranty_months?: number | null;
  warranty_info?: Record<string, unknown>;
  weight_grams?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;

  // --- Datos libres ---
  specs?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  badges?: string[];
  meta_title?: string | null;
  meta_description?: string | null;
  variants?: NormalizedVariant[];

  /** Payload original de la tienda. Permite reprocesar sin volver a descargar. */
  raw?: Record<string, unknown>;

  /** Hash del contenido. Lo calcula el runner si la estrategia no lo aporta. */
  content_hash?: string;
}

/** Categoria cruda de la tienda, tal como la publica. */
export interface NormalizedCategory {
  external_id: string;
  name: string;
  external_parent_id?: string | null;
  slug?: string | null;
  url?: string | null;
  level?: number;
  position?: number | null;
  product_count?: number | null;
  raw?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Interfaz de estrategia.
// -----------------------------------------------------------------------------

/** Todo lo que una estrategia recibe para trabajar. */
export interface ScrapeContext {
  store: StoreRow;
  target: ScrapeTargetRow;
  /** store.config fusionado con target.config (el target gana). */
  config: Record<string, unknown>;
  /** Cliente http con reintentos, timeout y cortesia ya aplicados. */
  http: HttpClient;
  /** Aborta la corrida cuando el endpoint se acerca a su limite de tiempo. */
  signal: AbortSignal;
  /** Deja rastro en scrape_runs.error_log / stats. */
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

/** Lo que una estrategia devuelve al runner. */
export interface ScrapeResult {
  products: NormalizedProduct[];
  categories?: NormalizedCategory[];
  pagesFetched: number;
  /** Total que la tienda dice tener; sirve para detectar barridos incompletos. */
  totalReported?: number;
  stats?: Record<string, unknown>;
  /** Errores no fatales (una pagina fallo pero el resto sirvio). */
  errors?: Array<{ stage: string; message: string; meta?: Record<string, unknown> }>;
}

export interface ScrapeStrategy {
  /** Clave con la que se referencia desde stores.strategy_key / targets.strategy_key. */
  key: string;
  /** Nombre legible para el panel. */
  label: string;
  /** Tipos de target que esta estrategia sabe atender. */
  supports: ScrapeTargetKind[];
  /** Descripcion de los campos de `config` que espera, para documentar el panel. */
  configSchema?: Array<{
    key: string;
    label: string;
    required?: boolean;
    example?: string;
    description?: string;
  }>;
  run(ctx: ScrapeContext): Promise<ScrapeResult>;
}

// -----------------------------------------------------------------------------
// Cliente http.
// -----------------------------------------------------------------------------

export interface HttpRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export interface HttpClient {
  getJson<T>(url: string, options?: HttpRequestOptions): Promise<T>;
  postJson<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T>;
  getText(url: string, options?: HttpRequestOptions): Promise<string>;
  /** Telemetria acumulada de la corrida. */
  readonly stats: { requests: number; errors: number; bytes: number };
}
