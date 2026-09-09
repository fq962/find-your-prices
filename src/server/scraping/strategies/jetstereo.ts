import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';

/**
 * Estrategia de scraping para Jetstereo (https://www.jetstereo.com).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * jetstereo.com corre sobre Next.js (App Router) con render en servidor, pero
 * la grilla de productos de categoria/busqueda se pinta en el navegador: el
 * html que entrega el servidor para /category/<slug> no trae ningun producto
 * de la grilla principal (se comprobo pidiendo la pagina con curl: 0 "sku" en
 * el documento). Ese fetch del navegador apunta a un motor de busqueda propio:
 *
 *   POST https://jetstereo-search-engine.ent.us-west-1.aws.found.io
 *        /api/as/v1/engines/jetstereo-main-engine/search
 *   Authorization: Bearer search-5t4ro38vq5xc6femwcezfixr
 *
 * Es Elastic App Search. La clave es publica a proposito (prefijo "search-":
 * Elastic la diseña para ir embebida en el cliente, a diferencia de una clave
 * "private-"); se encontro tal cual en el bundle de Jetstereo
 * (chunk que registra "getSearchResultsProducts"). Consumirla directo es mas
 * rico que la tarjeta visual: precio de lista, descuento, specs completas,
 * categorias con jerarquia y estado de stock, todo en una sola llamada.
 *
 * Notas de campo verificadas contra el motor (2026-09-08):
 *
 *   - El indice mezcla productos con paginas de marca+categoria para SEO
 *     (p.ej. url "/brands/bose/barras-de-sonido", sin sku ni sale_status).
 *     Sin filtrar, "query":"" devuelve 9661 documentos; filtrando por
 *     sale_status in [AVAILABLE, OUT_OF_STOCK] quedan 5618, que son los
 *     articulos reales. Ese filtro es obligatorio, no cosmetico.
 *
 *   - query:"" actua como "traer todo": no hace falta un termino de busqueda
 *     para paginar el catalogo completo, solo filtros.
 *
 *   - page.size maximo = 1000 (confirmado: 1001 responde 400 "must be less
 *     than or equal to 1,000").
 *
 *   - Sin "sort" explicito App Search ordena por relevancia, que puede variar
 *     entre llamadas con query vacio. Se ordena por "id" para que la
 *     paginacion sea estable y no repita ni salte articulos entre paginas.
 *
 *   - "url" ya viene absoluta y correcta (a diferencia de Diunsa/Ladylee, que
 *     hay que reconstruirla): no hace falta armar slugs a mano.
 *
 *   - "categories" es un array ordenado raiz -> hoja (2 a 4 niveles,
 *     verificado sobre 200 articulos) y categories[0].name siempre coincide
 *     con "main_category". Da la jerarquia completa sin pedir un endpoint
 *     aparte de categorias, a diferencia de Ladylee.
 *
 *   - "stock" es un numero fraccionario en varios articulos (ej.
 *     "28.421052631578945"), no una cantidad entera de inventario: parece un
 *     promedio o proyeccion interna. Se redondea para guardar algo legible,
 *     pero no se puede tratar como conteo exacto de unidades.
 *
 *   - "variants" vino vacio en los 5618 articulos del catalogo (barrido
 *     completo, sin excepciones). Por eso no se mapea: no hay forma de
 *     verificar el formato de una variante real sin datos, y este proyecto no
 *     adivina formatos sin evidencia (ver la nota de barcode en Ladylee).
 *
 *   - "compare_at"/precio de lista: igual que Diunsa y Ladylee, "regular"
 *     repite a "sale" cuando no hay rebaja. Solo cuenta como precio de lista
 *     si es estrictamente mayor.
 */

// -----------------------------------------------------------------------------
// Respuesta de Elastic App Search (interfaces locales, solo lo que se consume)
// -----------------------------------------------------------------------------

interface EsField<T> {
  raw: T;
}

interface JetstereoRawResult {
  id: EsField<string>;
  name?: EsField<string>;
  sku?: EsField<string>;
  model?: EsField<string>;
  slug?: EsField<string>;
  url?: EsField<string>;
  main_image?: EsField<string>;
  price?: EsField<string>;
  discount?: EsField<string>;
  currency?: EsField<string>;
  stock?: EsField<string>;
  sale_status?: EsField<string>;
  main_category?: EsField<string>;
  categories?: EsField<string[]>;
  brand?: EsField<string>;
  description?: EsField<string>;
  specs?: EsField<string[]>;
  ratings?: EsField<string>;
  variants?: EsField<unknown[]>;
  new?: EsField<string>;
  exclusive?: EsField<string>;
  coupon?: EsField<unknown>;
  has_discount_product?: EsField<string>;
  available_compare?: EsField<string>;
  available_for_pickup?: EsField<string>;
  physical?: EsField<string>;
  shipping_price_id?: EsField<number>;
  published_at?: EsField<string>;
}

interface JetstereoSearchResponse {
  meta: {
    page: { current: number; total_pages: number; total_results: number; size: number };
  };
  results: JetstereoRawResult[];
  errors?: string[];
}

/** Estructuras que viven serializadas dentro de los campos `raw` de arriba. */
interface JetstereoPrice {
  sale: number;
  regular: number;
}
interface JetstereoDiscount {
  amount: number;
  percentage: number;
  promoid: string;
}
interface JetstereoImageSet {
  full: string;
  [size: string]: string | undefined;
}
interface JetstereoBrand {
  id?: number;
  name: string;
  logo?: string | null;
  slug?: string | null;
  description?: string | null;
}
interface JetstereoCategoryRef {
  slug: string;
  name: string;
  category_id: number;
}
interface JetstereoRatings {
  average: number;
  reviews: number;
}
interface JetstereoSpecEntry {
  value: { id: number; name: string; category: string; value: string; sortOrder: number };
}
interface JetstereoDescriptionBlob {
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keyword?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  attributeDescription?: string | null;
}

// -----------------------------------------------------------------------------
// Valores por defecto
// -----------------------------------------------------------------------------

const DEFAULTS = {
  engineUrl: 'https://jetstereo-search-engine.ent.us-west-1.aws.found.io/api/as/v1/engines/jetstereo-main-engine',
  // Clave de busqueda publica de Elastic App Search (prefijo "search-"): esta
  // hecha para ir en codigo cliente. Se encontro tal cual en el bundle de
  // jetstereo.com, no es un secreto filtrado.
  searchKey: 'search-5t4ro38vq5xc6femwcezfixr',
  webBaseUrl: 'https://www.jetstereo.com',
  pageSize: 1000,
} as const;

/** Limite duro de App Search: pedir mas devuelve 400. */
const MAX_PAGE_SIZE = 1000;

/** Tope de paginas de una corrida. El catalogo real ronda 6 paginas a 1000. */
const MAX_PAGES_HARD_LIMIT = 50;

/** Los dos unicos estados de venta vistos en el indice. */
const SALE_STATUSES = ['AVAILABLE', 'OUT_OF_STOCK'] as const;

const RESULT_FIELDS = Object.fromEntries(
  [
    'id',
    'name',
    'sku',
    'model',
    'slug',
    'url',
    'main_image',
    'price',
    'discount',
    'currency',
    'stock',
    'sale_status',
    'main_category',
    'categories',
    'brand',
    'description',
    'specs',
    'ratings',
    'variants',
    'new',
    'exclusive',
    'coupon',
    'has_discount_product',
    'available_compare',
    'available_for_pickup',
    'physical',
    'shipping_price_id',
    'published_at',
  ].map((field) => [field, { raw: {} }]),
);

interface JetstereoConfig {
  engineUrl: string;
  searchKey: string;
  webBaseUrl: string;
  pageSize: number;
  /** Solo para targets de tipo categoria: filtra por main_category exacto. */
  mainCategory: string | null;
  /** Si es false, solo trae sale_status=AVAILABLE (oculta el agotado). */
  includeOutOfStock: boolean;
  syncCategories: boolean;
}

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para poder probarlas sin red)
// -----------------------------------------------------------------------------

/** Parsea un campo `raw` que Elastic entrega como json serializado a string. */
function parseRaw<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Redondea a centavos: los precios de la API traen artefactos de coma flotante. */
export function round2(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function toAvailability(saleStatus: string | undefined): AvailabilityStatus {
  if (saleStatus === 'AVAILABLE') return 'in_stock';
  if (saleStatus === 'OUT_OF_STOCK') return 'out_of_stock';
  return 'unknown';
}

/**
 * "stock" de Jetstereo es fraccionario (ver cabecera): se redondea para tener
 * algo legible, sin pretender que sea un conteo exacto de unidades.
 */
function parseStock(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Quita etiquetas html de las descripciones (vienen con clases de Tailwind). */
export function stripHtml(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|ul)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** La categoria mas especifica es la ultima del array raiz -> hoja. */
function leafCategory(categories: JetstereoCategoryRef[]): JetstereoCategoryRef | null {
  return categories.length > 0 ? categories[categories.length - 1] : null;
}

/** Construye el arbol de categorias a partir de lo que traen los productos. */
function collectCategories(
  categories: JetstereoCategoryRef[],
  into: Map<string, NormalizedCategory>,
  webBaseUrl: string,
): void {
  let parentId: string | null = null;
  for (const cat of categories) {
    const externalId = String(cat.category_id);
    if (!into.has(externalId)) {
      into.set(externalId, {
        external_id: externalId,
        name: cat.name,
        external_parent_id: parentId,
        slug: cat.slug,
        url: `${webBaseUrl.replace(/\/+$/, '')}/category/${cat.slug}`,
        raw: cat as unknown as Record<string, unknown>,
      });
    }
    parentId = externalId;
  }
}

function mapImages(imageSet: JetstereoImageSet | null, name: string): NormalizedImage[] {
  if (!imageSet?.full) return [];
  return [{ url: imageSet.full, position: 0, is_primary: true, alt_text: name }];
}

/** Traduce un resultado del motor de busqueda al contrato comun del sistema. */
export function mapJetstereoProduct(
  item: JetstereoRawResult,
  config: Pick<JetstereoConfig, 'webBaseUrl'>,
  currency: string,
): NormalizedProduct | null {
  const id = item.id?.raw;
  const name = item.name?.raw?.trim();
  const url = item.url?.raw;
  if (!id || !name || !url) return null;

  const price = parseRaw<JetstereoPrice>(item.price?.raw ?? null);
  const discount = parseRaw<JetstereoDiscount>(item.discount?.raw ?? null);
  const brand = parseRaw<JetstereoBrand>(item.brand?.raw ?? null);
  const ratings = parseRaw<JetstereoRatings>(item.ratings?.raw ?? null);
  const description = parseRaw<JetstereoDescriptionBlob>(item.description?.raw ?? null);
  const mainImage = parseRaw<JetstereoImageSet>(item.main_image?.raw ?? null);
  const categories = (item.categories?.raw ?? [])
    .map((raw) => parseRaw<JetstereoCategoryRef>(raw))
    .filter((c): c is JetstereoCategoryRef => c !== null);
  // Un articulo del catalogo real (id 4826) trae una entrada
  // {"value":null}: se descarta en vez de reventar el mapeo entero.
  const specs = (item.specs?.raw ?? [])
    .map((raw) => parseRaw<JetstereoSpecEntry>(raw))
    .filter((s): s is JetstereoSpecEntry => s !== null && s.value !== null && typeof s.value === 'object')
    .map((s) => s.value);

  const salePrice = round2(price?.sale ?? null);
  // "regular" repite a "sale" sin rebaja de verdad: solo cuenta si es mayor.
  const listPrice =
    price && price.regular > price.sale + 0.01 ? round2(price.regular) : null;
  const leaf = leafCategory(categories);

  const specsGrouped: Record<string, Record<string, string>> = {};
  for (const spec of specs) {
    if (!specsGrouped[spec.category]) specsGrouped[spec.category] = {};
    specsGrouped[spec.category][spec.name] = spec.value;
  }

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (item.new?.raw === 'true') badges.push('nuevo');
  if (item.exclusive?.raw === 'true') badges.push('exclusivo');
  if (item.sale_status?.raw === 'OUT_OF_STOCK') badges.push('agotado');

  const images = mapImages(mainImage, name);
  const descriptionText = stripHtml(description?.description);
  const shortDescriptionText = stripHtml(description?.shortDescription);
  const reviewCount = ratings?.reviews ?? 0;

  return {
    // Identidad
    external_id: id,
    name,
    url,
    slug: item.slug?.raw ?? null,
    sku: item.sku?.raw ?? null,
    external_code: item.model?.raw ?? null,
    model: item.model?.raw ?? null,

    // Contenido
    description: descriptionText || null,
    short_description: shortDescriptionText || null,
    brand_raw: brand?.name ?? null,
    condition: 'new',

    // Clasificacion
    store_category_external_id: leaf ? String(leaf.category_id) : null,
    category_raw: leaf?.name ?? item.main_category?.raw ?? null,
    category_path: categories.map((c) => c.name),

    // Precio
    currency: item.currency?.raw ?? currency,
    price: salePrice,
    list_price: listPrice,
    discount_percent: listPrice !== null ? discount?.percentage ?? null : null,
    discount_amount: listPrice !== null ? round2(discount?.amount ?? null) : null,
    tax_included: true,

    // Disponibilidad
    availability: toAvailability(item.sale_status?.raw),
    in_stock:
      item.sale_status?.raw === 'AVAILABLE' ? true : item.sale_status?.raw === 'OUT_OF_STOCK' ? false : null,
    stock_quantity: parseStock(item.stock?.raw),

    // Reputacion. reviews=0 hace que average=0 sea "sin datos", no "una estrella".
    rating_average: reviewCount > 0 ? ratings?.average ?? null : null,
    rating_count: reviewCount,

    // Medios
    primary_image_url: images[0]?.url ?? null,
    images,
    // Ver nota de cabecera: "variants" vino vacio en todo el catalogo. Se deja
    // sin mapear a proposito en vez de adivinar un formato sin evidencia.
    variants: [],

    // Datos libres
    specs: specsGrouped,
    attributes: {
      brand: brand
        ? { id: brand.id ?? null, slug: brand.slug ?? null, logo: brand.logo ?? null }
        : null,
      physical: item.physical?.raw ?? null,
      shippingPriceId: item.shipping_price_id?.raw ?? null,
      availableForPickup: item.available_for_pickup?.raw === 'true',
      availableCompare: item.available_compare?.raw === 'true',
      hasDiscountProduct: item.has_discount_product?.raw === 'true',
      metaKeyword: description?.meta_keyword ?? null,
      attributeDescription: description?.attributeDescription
        ? stripHtml(description.attributeDescription)
        : null,
      coupon: item.coupon?.raw ?? null,
    },
    badges,
    meta_title: description?.meta_title ?? null,
    meta_description: description?.meta_description ?? null,
    price_valid_until: item.published_at?.raw ?? null,

    raw: {
      id,
      name,
      sku: item.sku?.raw ?? null,
      model: item.model?.raw ?? null,
      url,
      price,
      discount,
      currency: item.currency?.raw ?? null,
      stock: item.stock?.raw ?? null,
      sale_status: item.sale_status?.raw ?? null,
      main_category: item.main_category?.raw ?? null,
      categories,
      brand,
      description,
      specs,
      ratings,
      new: item.new?.raw ?? null,
      exclusive: item.exclusive?.raw ?? null,
      published_at: item.published_at?.raw ?? null,
    },
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): JetstereoConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };
  const pageSize = Number(raw.pageSize);

  return {
    engineUrl: str('engineUrl', DEFAULTS.engineUrl).replace(/\/+$/, ''),
    searchKey: str('searchKey', DEFAULTS.searchKey),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    mainCategory: typeof raw.mainCategory === 'string' && raw.mainCategory.trim() ? raw.mainCategory.trim() : null,
    includeOutOfStock: raw.includeOutOfStock !== false,
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const jetstereoStrategy: ScrapeStrategy = {
  key: 'jetstereo',
  label: 'Jetstereo (Elastic App Search)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'mainCategory',
      label: 'Categoria principal',
      example: 'Celulares y Accesorios',
      description:
        'Solo para targets de tipo categoria: nombre exacto de main_category en Jetstereo (ver facets del motor).',
    },
    {
      key: 'includeOutOfStock',
      label: 'Incluir agotados',
      example: 'true',
      description: 'Trae tambien sale_status=OUT_OF_STOCK. Dejalo en true para no perder cobertura del catalogo.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '1000',
      description: 'Maximo aceptado por Elastic App Search: 1000.',
    },
    {
      key: 'syncCategories',
      label: 'Sincronizar categorias',
      example: 'true',
      description: 'Arma el arbol de categorias a partir de lo que trae cada producto (sin peticion extra).',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];

    const saleStatuses = config.includeOutOfStock ? [...SALE_STATUSES] : ['AVAILABLE'];
    const filters: Record<string, unknown>[] = [{ sale_status: saleStatuses }];
    if (config.mainCategory) filters.push({ main_category: [config.mainCategory] });

    const products: NormalizedProduct[] = [];
    const categoryMap = new Map<string, NormalizedCategory>();
    const seen = new Set<string>();
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let page = 1;
    let pagesFetched = 0;
    let totalReported: number | undefined;

    while (pagesFetched < maxPages) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'search', message: 'Corrida abortada por limite de tiempo' });
        break;
      }

      let response: JetstereoSearchResponse;
      try {
        response = await ctx.http.postJson<JetstereoSearchResponse>(
          `${config.engineUrl}/search`,
          {
            query: '',
            page: { current: page, size: config.pageSize },
            // Sin orden explicito la relevancia puede variar entre llamadas
            // con query vacio y desalinear la paginacion (ver cabecera).
            sort: { id: 'asc' },
            filters: { all: filters },
            result_fields: RESULT_FIELDS,
          },
          { headers: { Authorization: `Bearer ${config.searchKey}` } },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'search', message, meta: { page, pageSize: config.pageSize } });
        ctx.log('error', `Fallo la pagina ${page}: ${message}`);
        break;
      }

      pagesFetched += 1;
      totalReported = response.meta?.page?.total_results ?? totalReported;

      const batch = response.results ?? [];
      if (batch.length === 0) break;

      for (const item of batch) {
        const mapped = mapJetstereoProduct(item, config, currency);
        if (!mapped) continue;
        if (config.syncCategories) {
          const rawCategories = (item.categories?.raw ?? [])
            .map((raw) => parseRaw<JetstereoCategoryRef>(raw))
            .filter((c): c is JetstereoCategoryRef => c !== null);
          collectCategories(rawCategories, categoryMap, config.webBaseUrl);
        }
        // Un articulo puede aparecer en el borde de dos paginas si el indice
        // cambia entre llamadas: se queda con la primera aparicion.
        if (!seen.has(mapped.external_id)) {
          seen.add(mapped.external_id);
          products.push(mapped);
        }
      }

      const totalPages = response.meta?.page?.total_pages ?? page;
      if (page >= totalPages) break;
      if (batch.length < config.pageSize) break;
      page += 1;
    }

    if (totalReported !== undefined && products.length < totalReported) {
      ctx.log(
        'warn',
        `Se obtuvieron ${products.length} de ${totalReported} articulos que reporta el motor de busqueda`,
      );
    }

    return {
      products,
      categories: categoryMap.size > 0 ? [...categoryMap.values()] : undefined,
      pagesFetched,
      totalReported,
      errors,
      stats: {
        mainCategory: config.mainCategory,
        includeOutOfStock: config.includeOutOfStock,
        pageSize: config.pageSize,
        totalReported,
      },
    };
  },
};
