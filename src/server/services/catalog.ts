import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';
import type { AvailabilityStatus } from '@/server/scraping/types';
import type { Product } from '@/types';

/**
 * Lectura del catálogo público.
 *
 * Lee de `v_store_products_current`, que ya trae tienda, marca y categoría
 * resueltas. La vista filtra por `is_active`, así que lo que sale de acá es
 * siempre oferta viva.
 *
 * Punto importante de diseño: el catálogo son miles de artículos y no se
 * mandan todos al navegador. La página sirve un primer lote curado y tanto la
 * búsqueda como los filtros se resuelven en Postgres.
 */

/** Fila cruda de la vista de listado. */
interface CatalogRow {
  id: string;
  store_slug: string;
  store_name: string;
  name: string;
  url: string | null;
  primary_image_url: string | null;
  brand: string | null;
  category_raw: string | null;
  store_category_name: string | null;
  currency: string;
  price: number | null;
  list_price: number | null;
  discount_percent: number | null;
  availability: AvailabilityStatus;
  in_stock: boolean | null;
  rating_average: number | null;
  rating_count: number | null;
}

const VIEW = 'v_store_products_current';
const COLUMNS =
  'id, store_slug, store_name, name, url, primary_image_url, brand, category_raw, ' +
  'store_category_name, currency, price, list_price, discount_percent, availability, ' +
  'in_stock, rating_average, rating_count';

/**
 * Columna con la fecha en que el artículo apareció por primera vez.
 *
 * La agrega la migración 0017 a `v_store_products_current`. Antes de aplicarla
 * la vista no la expone y ordenar por ella devuelve error 42703; por eso
 * `searchCatalog` reintenta con `last_seen_at`, que está en la vista desde el
 * principio. Así "Recién agregados" degrada a "visto hace poco" en vez de
 * dejar la home en blanco mientras la migración no corre.
 */
const NEWEST_COLUMN = 'first_seen_at';

/** Etiquetas de disponibilidad por idioma. El componente solo pinta el texto. */
const AVAILABILITY_LABELS: Record<'es' | 'en', Partial<Record<AvailabilityStatus, string>>> = {
  es: {
    in_stock: 'Disponible',
    limited: 'Últimas unidades',
    out_of_stock: 'Agotado',
    preorder: 'Preventa',
    backorder: 'Bajo pedido',
    discontinued: 'Descontinuado',
  },
  en: {
    in_stock: 'In stock',
    limited: 'Low stock',
    out_of_stock: 'Out of stock',
    preorder: 'Preorder',
    backorder: 'Backorder',
    discontinued: 'Discontinued',
  },
};

export type CatalogLocale = 'es' | 'en';

function toProduct(row: CatalogRow, locale: CatalogLocale): Product {
  return {
    id: row.id,
    name: row.name,
    price: row.price ?? 0,
    currency: row.currency,
    store: row.store_name,
    storeSlug: row.store_slug,
    // La categoría de la tienda es más específica que la cruda; se prefiere.
    category: row.store_category_name ?? row.category_raw ?? 'Sin categoría',
    imageUrl: row.primary_image_url ?? undefined,
    availability: AVAILABILITY_LABELS[locale][row.availability],
    // La marca es el subtítulo natural: los nombres de Diunsa vienen truncados
    // a 40 caracteres y una descripción larga no aporta en una fila de lista.
    description: row.brand ?? undefined,
    url: row.url ?? undefined,
    brand: row.brand ?? undefined,
    listPrice: row.list_price ?? undefined,
    discountPercent: row.discount_percent ?? undefined,
    inStock: row.in_stock ?? undefined,
    ratingAverage: row.rating_average ?? undefined,
    ratingCount: row.rating_count ?? undefined,
  };
}

// -----------------------------------------------------------------------------
// Facetas
// -----------------------------------------------------------------------------

export interface FacetOption {
  value: string;
  count: number;
}

export interface CatalogFacets {
  categories: FacetOption[];
  stores: FacetOption[];
  brands: FacetOption[];
  minPrice: number;
  maxPrice: number;
  totalProducts: number;
  totalStores: number;
  totalCategories: number;
  discountedProducts: number;
}

const EMPTY_FACETS: CatalogFacets = {
  categories: [],
  stores: [],
  brands: [],
  minPrice: 0,
  maxPrice: 0,
  totalProducts: 0,
  totalStores: 0,
  totalCategories: 0,
  discountedProducts: 0,
};

/**
 * Opciones de filtro que de verdad devuelven algo.
 *
 * Se derivan de los productos existentes, NO del árbol de categorías que
 * publica la tienda. La diferencia no es cosmética: en Diunsa el árbol tiene
 * 266 nodos y solo 62 tienen artículos, porque los padres y los nodos de
 * campaña ("Todos", "Tecnología", "Lego") nunca reciben productos. Armar el
 * selector con el árbol ofrecía 204 categorías que devolvían cero resultados.
 */
export async function getCatalogFacets(): Promise<CatalogFacets> {
  try {
    const db = getSupabaseAdmin();

    const [categories, stores, brands, summary] = await Promise.all([
      db
        .from('v_catalog_category_facets')
        .select('category_name, product_count')
        .order('product_count', { ascending: false }),
      db.from('v_catalog_store_facets').select('store_name, product_count'),
      db
        .from('v_catalog_brand_facets')
        .select('brand_name, product_count')
        .order('product_count', { ascending: false })
        .limit(300),
      db.from('v_catalog_summary').select('*').single(),
    ]);

    // Si las vistas de faceta no existen todavía (migración 0013 sin aplicar),
    // se calcula igual, aunque más lento. Nunca se cae al árbol de la tienda:
    // ese era justamente el bug.
    if (categories.error || stores.error || summary.error) {
      return await computeFacetsByScan();
    }

    const toOptions = (rows: unknown[], key: string): FacetOption[] =>
      (rows as Record<string, unknown>[])
        .map((row) => ({ value: String(row[key] ?? ''), count: Number(row.product_count ?? 0) }))
        .filter((option) => option.value !== '' && option.count > 0)
        .sort((a, b) => b.count - a.count);

    const totals = summary.data as Record<string, number>;

    return {
      categories: toOptions(categories.data ?? [], 'category_name'),
      stores: toOptions(stores.data ?? [], 'store_name'),
      brands: brands.error ? [] : toOptions(brands.data ?? [], 'brand_name'),
      minPrice: Number(totals.min_price ?? 0),
      maxPrice: Number(totals.max_price ?? 0),
      totalProducts: Number(totals.total_products ?? 0),
      totalStores: Number(totals.total_stores ?? 0),
      totalCategories: Number(totals.total_categories ?? 0),
      discountedProducts: Number(totals.discounted_products ?? 0),
    };
  } catch {
    return EMPTY_FACETS;
  }
}

/**
 * Cálculo de facetas sin las vistas de la migración 0013.
 *
 * PostgREST devuelve como mucho 1000 filas por petición, así que se recorre por
 * páginas pidiendo solo las columnas necesarias. Es correcto pero cuesta varios
 * viajes; con la migración aplicada este camino no se usa. Solo corre durante
 * la revalidación de la página (cada 5 minutos), nunca por visitante.
 */
async function computeFacetsByScan(): Promise<CatalogFacets> {
  const db = getSupabaseAdmin();
  const PAGE = 1000;
  const MAX_PAGES = 40; // tope de seguridad: 40 000 artículos

  const categoryCounts = new Map<string, number>();
  const storeCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let total = 0;
  let discounted = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await db
      .from(VIEW)
      .select('store_category_name, store_name, brand, price, list_price')
      .not('price', 'is', null)
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (error) break;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    for (const row of rows) {
      total += 1;
      const price = Number(row.price);
      if (Number.isFinite(price)) {
        if (price < min) min = price;
        if (price > max) max = price;
      }
      if (row.list_price !== null) discounted += 1;

      const bump = (map: Map<string, number>, value: unknown) => {
        const key = typeof value === 'string' ? value.trim() : '';
        if (key) map.set(key, (map.get(key) ?? 0) + 1);
      };
      bump(categoryCounts, row.store_category_name);
      bump(storeCounts, row.store_name);
      bump(brandCounts, row.brand);
    }

    if (rows.length < PAGE) break;
  }

  const toOptions = (map: Map<string, number>, minCount = 1): FacetOption[] =>
    [...map.entries()]
      .filter(([, count]) => count >= minCount)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

  return {
    categories: toOptions(categoryCounts),
    stores: toOptions(storeCounts),
    brands: toOptions(brandCounts, 2).slice(0, 300),
    minPrice: Number.isFinite(min) ? min : 0,
    maxPrice: max,
    totalProducts: total,
    totalStores: storeCounts.size,
    totalCategories: categoryCounts.size,
    discountedProducts: discounted,
  };
}

// -----------------------------------------------------------------------------
// Listado y búsqueda
// -----------------------------------------------------------------------------

export type CatalogSort =
  | 'newest'
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'discount'
  | 'name-asc'
  | 'rating';

export interface SearchCatalogParams {
  query?: string;
  store?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  onlyDiscounted?: boolean;
  onlyInStock?: boolean;
  sort?: CatalogSort;
  limit?: number;
  offset?: number;
  locale?: CatalogLocale;
}

export interface SearchCatalogResult {
  products: Product[];
  /** Total que cumple los filtros, no solo lo devuelto en esta página. */
  total: number;
}

/**
 * Búsqueda y filtrado sobre el catálogo completo, resuelto en Postgres.
 *
 * Es lo que hace honesta a la caja de búsqueda: filtrar en el navegador solo
 * encontraría entre los artículos ya servidos, y el usuario creería que el
 * resto no existe.
 */
export async function searchCatalog(params: SearchCatalogParams): Promise<SearchCatalogResult> {
  const result = await runCatalogQuery(params, NEWEST_COLUMN);

  // Sin la migración 0017 la vista no tiene `first_seen_at` y la consulta falla
  // entera. Se reintenta una vez con la columna que sí existe en vez de
  // devolver un catálogo vacío que parecería una base sin datos.
  if (result === null) {
    return (await runCatalogQuery(params, 'last_seen_at')) ?? { products: [], total: 0 };
  }
  return result;
}

/**
 * Una pasada de la consulta. Devuelve `null` —y solo `null`— cuando la columna
 * de novedad no existe, que es la única condición que vale la pena reintentar.
 */
async function runCatalogQuery(
  params: SearchCatalogParams,
  newestColumn: string,
): Promise<SearchCatalogResult | null> {
  const limit = Math.min(params.limit ?? 60, 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const locale = params.locale ?? 'es';

  try {
    // El encadenado condicional de filtros sobre el builder tipado de
    // supabase-js dispara "Type instantiation is excessively deep": cada
    // .eq()/.gte() reescribe el tipo del resultado. Se afloja el tipo del
    // builder a propósito; la forma real de las filas se fija abajo, al
    // mapearlas a CatalogRow.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let request: any = getSupabaseAdmin()
      .from(VIEW)
      .select(COLUMNS, { count: 'exact' })
      .not('price', 'is', null);

    const query = params.query?.trim();
    if (query) {
      // ilike con comodines a ambos lados: busca la frase en cualquier parte
      // del nombre. Los % y _ del usuario se escapan para que no actúen como
      // comodines y devuelvan resultados que nadie pidió.
      const safe = query.replace(/[%_\\]/g, (char) => `\\${char}`);
      request = request.ilike('name', `%${safe}%`);
    }
    if (params.store) request = request.eq('store_name', params.store);
    if (params.category) request = request.eq('store_category_name', params.category);
    if (params.brand) request = request.eq('brand', params.brand);
    if (params.minPrice !== undefined) request = request.gte('price', params.minPrice);
    if (params.maxPrice !== undefined) request = request.lte('price', params.maxPrice);
    if (params.onlyDiscounted) request = request.not('list_price', 'is', null);
    if (params.onlyInStock) request = request.eq('in_stock', true);

    switch (params.sort) {
      // Lo más nuevo primero. `nullsFirst: false` deja al final lo que no tiene
      // fecha: un artículo sin registrar no es un artículo antiquísimo.
      case 'newest':
        request = request.order(newestColumn, { ascending: false, nullsFirst: false });
        break;
      case 'price-asc':
        request = request.order('price', { ascending: true });
        break;
      case 'price-desc':
        request = request.order('price', { ascending: false });
        break;
      case 'name-asc':
        request = request.order('name', { ascending: true });
        break;
      case 'rating':
        request = request.order('rating_average', { ascending: false, nullsFirst: false });
        break;
      case 'discount':
      default:
        request = request.order('discount_percent', { ascending: false, nullsFirst: false });
    }

    // Desempate estable: sin una segunda clave, dos páginas consecutivas pueden
    // repetir o saltarse artículos con el mismo descuento.
    request = request.order('id', { ascending: true });

    const { data, error, count } = await request.range(offset, offset + limit - 1);
    if (error) {
      // 42703 = undefined_column en Postgres. Es lo que responde PostgREST
      // cuando se ordena por una columna que la vista todavía no publica.
      const missingColumn =
        error.code === '42703' || String(error.message).includes(newestColumn);
      if (missingColumn && params.sort === 'newest') return null;
      throw new Error(error.message);
    }

    return {
      products: ((data ?? []) as unknown as CatalogRow[]).map((row) => toProduct(row, locale)),
      total: count ?? 0,
    };
  } catch {
    return { products: [], total: 0 };
  }
}

export interface CatalogSnapshot {
  products: Product[];
  facets: CatalogFacets;
  total: number;
}

const EMPTY_SNAPSHOT: CatalogSnapshot = {
  products: [],
  facets: EMPTY_FACETS,
  total: 0,
};

/**
 * Primer lote que ve el visitante, más las facetas.
 *
 * Se ordena por lo recién agregado, que es el mismo criterio por defecto del
 * selector de orden: el primer lote y lo que devuelve la primera búsqueda
 * tienen que estar ordenados igual, o cambiar de opinión sobre el orden
 * parecería un fallo.
 */
export async function getCatalogSnapshot(options?: {
  limit?: number;
  locale?: CatalogLocale;
}): Promise<CatalogSnapshot> {
  try {
    const [listing, facets] = await Promise.all([
      searchCatalog({
        sort: 'newest',
        limit: options?.limit ?? 90,
        locale: options?.locale ?? 'es',
      }),
      getCatalogFacets(),
    ]);

    return { products: listing.products, facets, total: listing.total };
  } catch {
    // Sin base (migraciones sin correr, red caída) la home no debe romperse:
    // la vista decide qué mostrar con un catálogo vacío.
    return EMPTY_SNAPSHOT;
  }
}

// -----------------------------------------------------------------------------
// Ficha de producto
// -----------------------------------------------------------------------------

export interface ProductImage {
  url: string;
  position: number;
  isPrimary: boolean;
  altText?: string;
}

export interface ProductVariant {
  externalId: string;
  name?: string;
  color?: string;
  size?: string;
  price?: number;
  listPrice?: number;
  inStock?: boolean;
}

export interface PricePointRow {
  scrapedAt: string;
  price: number | null;
  listPrice: number | null;
  previousPrice: number | null;
  priceDelta: number | null;
  inStock: boolean | null;
}

export interface ProductDetail extends Product {
  externalId: string;
  sku?: string;
  gtin?: string;
  barcode?: string;
  model?: string;
  color?: string;
  size?: string;
  condition?: string;
  categoryPath: string[];
  unitMeasureName?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  stockQuantity?: number;
  minOrderQuantity?: number;
  memberPrice?: number;
  discountAmount?: number;
  warrantyMonths?: number;
  weightGrams?: number;
  images: ProductImage[];
  variants: ProductVariant[];
  specs: Record<string, unknown>;
  attributes: Record<string, unknown>;
  badges: string[];
  priceHistory: PricePointRow[];
  firstSeenAt: string;
  lastSeenAt: string;
  lastPriceChangeAt?: string;
  /** Cuántos días lleva el precio actual sin moverse. */
  daysAtCurrentPrice?: number;
  /** Mínimo histórico observado. Contexto real, no marketing. */
  lowestPrice?: number;
  highestPrice?: number;
}

/**
 * Ficha completa. Devuelve `null` si el artículo no existe o dejó de estar
 * activo, para que la ruta responda 404 en vez de una página vacía.
 */
export async function getProductDetail(
  id: string,
  locale: CatalogLocale = 'es',
): Promise<ProductDetail | null> {
  try {
    const db = getSupabaseAdmin();

    const { data, error } = await db
      .from('store_products')
      .select(
        `*,
         stores!inner(name, slug, logo_url, is_active),
         store_categories(name),
         store_product_images(url, position, is_primary, alt_text),
         store_product_variants(external_id, name, color, size, price, list_price, in_stock)`,
      )
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, never> & Record<string, unknown>;
    const store = row.stores as { name: string; slug: string } | null;
    if (!store) return null;

    // El histórico se pide aparte: es una serie que puede ser larga y no tiene
    // sentido arrastrarla en el mismo join.
    const { data: history } = await db
      .from('price_history')
      .select('scraped_at, price, list_price, previous_price, price_delta, in_stock')
      .eq('store_product_id', id)
      .order('scraped_at', { ascending: true })
      .limit(200);

    const priceHistory: PricePointRow[] = ((history ?? []) as Record<string, unknown>[]).map(
      (point) => ({
        scrapedAt: String(point.scraped_at),
        price: point.price === null ? null : Number(point.price),
        listPrice: point.list_price === null ? null : Number(point.list_price),
        previousPrice: point.previous_price === null ? null : Number(point.previous_price),
        priceDelta: point.price_delta === null ? null : Number(point.price_delta),
        inStock: point.in_stock as boolean | null,
      }),
    );

    const observedPrices = priceHistory
      .map((point) => point.price)
      .filter((price): price is number => price !== null);

    const images = ((row.store_product_images ?? []) as Record<string, unknown>[])
      .map((image) => ({
        url: String(image.url),
        position: Number(image.position ?? 0),
        isPrimary: Boolean(image.is_primary),
        altText: (image.alt_text as string | null) ?? undefined,
      }))
      .sort((a, b) => a.position - b.position);

    const variants = ((row.store_product_variants ?? []) as Record<string, unknown>[]).map(
      (variant) => ({
        externalId: String(variant.external_id),
        name: (variant.name as string | null) ?? undefined,
        color: (variant.color as string | null) ?? undefined,
        size: (variant.size as string | null) ?? undefined,
        price: variant.price === null ? undefined : Number(variant.price),
        listPrice: variant.list_price === null ? undefined : Number(variant.list_price),
        inStock: (variant.in_stock as boolean | null) ?? undefined,
      }),
    );

    const lastPriceChangeAt = (row.last_price_change_at as string | null) ?? undefined;
    const daysAtCurrentPrice = lastPriceChangeAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastPriceChangeAt).getTime()) / 86_400_000))
      : undefined;

    const num = (value: unknown): number | undefined =>
      value === null || value === undefined ? undefined : Number(value);
    const str = (value: unknown): string | undefined =>
      value === null || value === undefined || value === '' ? undefined : String(value);

    const storeCategory = row.store_categories as { name: string } | null;
    const availability = row.availability as AvailabilityStatus;

    return {
      id: String(row.id),
      externalId: String(row.external_id),
      name: String(row.name),
      price: Number(row.price ?? 0),
      currency: String(row.currency ?? 'HNL'),
      store: store.name,
      storeSlug: store.slug,
      category: storeCategory?.name ?? str(row.category_raw) ?? 'Sin categoría',
      categoryPath: (row.category_path as string[] | null) ?? [],
      imageUrl: str(row.primary_image_url),
      availability: AVAILABILITY_LABELS[locale][availability],
      description: str(row.description),
      url: str(row.url),
      brand: str(row.brand_raw),
      listPrice: num(row.list_price),
      discountPercent: num(row.discount_percent),
      discountAmount: num(row.discount_amount),
      memberPrice: num(row.member_price),
      inStock: (row.in_stock as boolean | null) ?? undefined,
      stockQuantity: num(row.stock_quantity),
      minOrderQuantity: num(row.min_order_quantity),
      ratingAverage: num(row.rating_average),
      ratingCount: num(row.rating_count),
      sku: str(row.sku),
      gtin: str(row.gtin),
      barcode: str(row.barcode_raw),
      model: str(row.model),
      color: str(row.color),
      size: str(row.size),
      condition: str(row.condition),
      unitMeasureName: str(row.unit_measure_name),
      taxRate: num(row.tax_rate),
      taxIncluded: (row.tax_included as boolean | null) ?? undefined,
      warrantyMonths: num(row.warranty_months),
      weightGrams: num(row.weight_grams),
      images,
      variants,
      specs: (row.specs as Record<string, unknown>) ?? {},
      attributes: (row.attributes as Record<string, unknown>) ?? {},
      badges: (row.badges as string[] | null) ?? [],
      priceHistory,
      firstSeenAt: String(row.first_seen_at),
      lastSeenAt: String(row.last_seen_at),
      lastPriceChangeAt,
      daysAtCurrentPrice,
      lowestPrice: observedPrices.length ? Math.min(...observedPrices) : undefined,
      highestPrice: observedPrices.length ? Math.max(...observedPrices) : undefined,
    };
  } catch {
    return null;
  }
}

/** Artículos parecidos: misma categoría, distinto id, ordenados por descuento. */
export async function getRelatedProducts(
  product: Pick<ProductDetail, 'id' | 'category'>,
  locale: CatalogLocale = 'es',
  limit = 8,
): Promise<Product[]> {
  const { products } = await searchCatalog({
    category: product.category,
    sort: 'discount',
    limit: limit + 1,
    locale,
  });
  return products.filter((candidate) => candidate.id !== product.id).slice(0, limit);
}
