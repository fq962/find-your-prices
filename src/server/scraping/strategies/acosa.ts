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
 * Estrategia de scraping para ACOSA (https://acosa.com.hn).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * acosa.com.hn es WordPress + WooCommerce. El html de categoria SI trae
 * productos (WooCommerce renderiza en servidor), pero WooCommerce publica su
 * "Store API" sin autenticacion (la misma que usa el tema para el carrito por
 * bloques): mas rica que la tarjeta visual -- precio ya resuelto, stock,
 * atributos con marca/codigo de barra, galeria completa y categoria con
 * jerarquia -- y sin depender del html del tema, que puede cambiar.
 *
 * Endpoint usado (publico, sin token, con una condicion, ver abajo):
 *   GET {webBaseUrl}/API/wc/store/v1/products?per_page=100&page=N&orderby=id&order=asc
 *
 * El sitio remapea la base de la REST API de WordPress de /wp-json/ a /API/
 * (se ve en el header `Link: <https://acosa.com.hn/API/>; rel="api.w.org"` de
 * cualquier respuesta). Se probo primero /wp-json/, da 404; /API/ funciona.
 *
 * Notas de campo verificadas contra el sitio (2026-09-09):
 *
 *   - Portal detras de una verificacion propia ("Bluexpace"), no de
 *     Cloudflare: sin cookie, cualquier request (html o API) responde 302 a
 *     `/bxVerify.html`, que a su vez solo hace `document.cookie="bxVer=1"` y
 *     redirige. No hay puzzle que resolver: alcanza con mandar esa cookie de
 *     entrada en cada request. Verificado: con `Cookie: bxVer=1` la API
 *     responde 200 directo, sin necesidad de sesion ni de pasar por el html.
 *
 *   - La respuesta JSON trae un BOM UTF-8 al inicio (`EF BB BF`, verificado
 *     con `xxd`). `JSON.parse` de JavaScript no lo tolera y tira
 *     `SyntaxError`; hay que recortarlo antes de parsear. Por eso esta
 *     estrategia usa `http.getText` en vez de `http.getJson`.
 *
 *   - Los precios (`prices.price`, `regular_price`, `sale_price`) vienen como
 *     STRING en unidad menor (centavos): "5900" = L59.00. Se confirma contra
 *     `price_html` ("L59.00") y `currency_minor_unit: 2`. Dividir por
 *     10^currency_minor_unit, no usar el numero tal cual.
 *
 *   - `categories` de un producto viene hoja -> raiz (al reves que
 *     Jetstereo/RadioShack): el primer elemento es la categoria mas
 *     especifica. Se invierte para construir `category_path` raiz -> hoja,
 *     consistente con el resto de las estrategias.
 *
 *   - No usan la taxonomia de marcas de WooCommerce (`/products/brands`
 *     devuelve `[]` en todo el catalogo). La marca vive como atributo de
 *     producto normal ("Marca"), junto a "Numero de parte" y, en varios
 *     articulos, "Codigo de Barra" -- se leen los tres por nombre.
 *
 *   - `per_page` maximo = 100, y a diferencia de RadioShack la API SI avisa:
 *     101 responde 400 `rest_invalid_param` explicito.
 *
 *   - No hay campo numerico de stock exacto salvo cuando esta bajo
 *     (`low_stock_remaining`). El resto del tiempo solo esta el texto
 *     `stock_availability.text` ("200 disponibles"): se extrae el numero
 *     inicial a falta de algo mejor, documentado como aproximado.
 *
 *   - Ningun producto muestreado (cientos, en varias paginas) fue de tipo
 *     distinto a "simple": no hay como verificar el formato real de
 *     `variations`/`price_range` para productos variables. Se dejan sin
 *     mapear a proposito en vez de adivinar (mismo criterio que las
 *     variantes de Jetstereo).
 */

// -----------------------------------------------------------------------------
// Respuesta de la Store API (interfaces locales, solo lo que se consume)
// -----------------------------------------------------------------------------

interface WcPrices {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_code?: string;
  currency_minor_unit?: number;
}

interface WcCategoryRef {
  id: number;
  name: string;
  slug: string;
  link: string;
}

interface WcAttributeTerm {
  id: number;
  name: string;
  slug: string;
}

interface WcAttribute {
  id: number;
  name: string;
  taxonomy: string | null;
  terms: WcAttributeTerm[];
}

interface WcImage {
  id: number;
  src: string;
  name?: string | null;
  alt?: string | null;
}

interface WcStockAvailability {
  text: string;
  class: string;
}

interface WcProduct {
  id: number;
  name: string;
  slug: string;
  type: string;
  permalink: string;
  sku: string;
  short_description: string;
  description: string;
  on_sale: boolean;
  prices: WcPrices;
  average_rating: string;
  review_count: number;
  images: WcImage[];
  categories: WcCategoryRef[];
  attributes: WcAttribute[];
  is_purchasable: boolean;
  is_in_stock: boolean;
  is_on_backorder: boolean;
  low_stock_remaining: number | null;
  stock_availability: WcStockAvailability;
  weight?: string;
  dimensions?: { length: string; width: string; height: string };
}

// -----------------------------------------------------------------------------
// Valores por defecto
// -----------------------------------------------------------------------------

const DEFAULTS = {
  apiBaseUrl: 'https://acosa.com.hn/API/wc/store/v1',
  webBaseUrl: 'https://acosa.com.hn',
  pageSize: 100,
} as const;

/** Limite real de la Store API: 101 responde 400 rest_invalid_param. */
const MAX_PAGE_SIZE = 100;

/** Tope de paginas de una corrida. El catalogo real ronda 95 paginas a 100. */
const MAX_PAGES_HARD_LIMIT = 200;

/** Cookie que exige el portal de verificacion propio del sitio (ver cabecera). */
const BX_VERIFY_COOKIE = 'bxVer=1';

interface AcosaConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  pageSize: number;
  /** Solo para targets de tipo categoria: id numerico de la categoria de WooCommerce. */
  categoryId: string | null;
  syncCategories: boolean;
}

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para poder probarlas sin red)
// -----------------------------------------------------------------------------

export function round2(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * La Store API antepone un BOM UTF-8 a cada respuesta (verificado con `xxd`:
 * `EF BB BF` antes del `[`). `JSON.parse` no lo tolera, asi que se recorta
 * antes de parsear.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Los precios de WooCommerce vienen como string en unidad menor (centavos). */
export function minorToDecimal(raw: string | null | undefined, minorUnit: number): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return round2(n / 10 ** minorUnit);
}

/** Quita acentos y mayusculas para comparar nombres de atributo sin depender de tildes. */
function normalizeLabel(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Busca un atributo de producto por nombre (marca, codigo de barra, etc.) y devuelve su primer termino. */
export function findAttributeTerm(attributes: WcAttribute[], candidates: string[]): string | null {
  const wanted = candidates.map(normalizeLabel);
  const match = attributes.find((a) => wanted.includes(normalizeLabel(a.name)));
  return match?.terms?.[0]?.name ?? null;
}

/** Las descripciones de WooCommerce vienen en html del editor de WordPress. */
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

function toAvailability(item: Pick<WcProduct, 'is_in_stock' | 'is_on_backorder'>): AvailabilityStatus {
  if (item.is_in_stock) return 'in_stock';
  if (item.is_on_backorder) return 'backorder';
  return 'out_of_stock';
}

/** El texto ("200 disponibles") es lo unico con un numero; se extrae a falta de un campo exacto. */
function parseStockFromText(item: Pick<WcProduct, 'is_in_stock' | 'stock_availability'>): number | null {
  if (!item.is_in_stock) return null;
  const match = /^(\d+)/.exec(item.stock_availability?.text ?? '');
  return match ? Number(match[1]) : null;
}

function mapImages(item: WcProduct): NormalizedImage[] {
  return (item.images ?? [])
    .filter((img) => typeof img.src === 'string' && img.src.length > 0)
    .map((img, index) => ({
      url: img.src,
      external_id: String(img.id),
      position: index,
      is_primary: index === 0,
      alt_text: img.alt || img.name || item.name,
    }));
}

/** La categoria mas especifica es la PRIMERA del array (WooCommerce la da hoja -> raiz). */
function leafCategory(categories: WcCategoryRef[]): WcCategoryRef | null {
  return categories.length > 0 ? categories[0] : null;
}

/** Construye el arbol de categorias a partir de lo que traen los productos. */
function collectCategories(
  categoriesLeafFirst: WcCategoryRef[],
  into: Map<string, NormalizedCategory>,
): void {
  // Se recorre raiz -> hoja (orden inverso al que entrega la API) para poder
  // encadenar cada nivel con el anterior.
  const rootToLeaf = [...categoriesLeafFirst].reverse();
  let parentId: string | null = null;
  for (const cat of rootToLeaf) {
    const externalId = String(cat.id);
    if (!into.has(externalId)) {
      into.set(externalId, {
        external_id: externalId,
        name: cat.name,
        external_parent_id: parentId,
        slug: cat.slug,
        url: cat.link,
        raw: cat as unknown as Record<string, unknown>,
      });
    }
    parentId = externalId;
  }
}

/** Traduce un producto de la Store API de WooCommerce al contrato comun del sistema. */
export function mapAcosaProduct(item: WcProduct, currency: string): NormalizedProduct | null {
  const id = item?.id;
  const name = item?.name?.trim();
  const url = item?.permalink;
  if (!id || !name || !url) return null;

  const minorUnit = item.prices?.currency_minor_unit ?? 2;
  const price = minorToDecimal(item.prices?.price, minorUnit);
  const regular = minorToDecimal(item.prices?.regular_price, minorUnit);
  // "regular_price" repite a "price" sin rebaja de verdad: solo cuenta como
  // precio de lista si es estrictamente mayor.
  const listPrice = regular !== null && price !== null && regular > price + 0.001 ? regular : null;

  const attributes = item.attributes ?? [];
  const brandRaw = findAttributeTerm(attributes, ['marca', 'brand']);
  const barcode = findAttributeTerm(attributes, ['codigo de barra', 'código de barra', 'ean', 'upc', 'barcode']);
  const mpn = findAttributeTerm(attributes, ['numero de parte', 'número de parte', 'part number', 'mpn']);

  const categories = item.categories ?? [];
  const leaf = leafCategory(categories);
  const availability = toAvailability(item);
  const reviewCount = item.review_count ?? 0;

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (availability === 'out_of_stock') badges.push('agotado');

  return {
    // Identidad
    external_id: String(id),
    name,
    url,
    slug: item.slug ?? null,
    sku: item.sku || null,
    external_code: item.sku || null,
    mpn,
    barcode_raw: barcode,

    // Contenido
    description: stripHtml(item.description) || null,
    short_description: stripHtml(item.short_description) || null,
    brand_raw: brandRaw,
    condition: 'new',

    // Clasificacion
    store_category_external_id: leaf ? String(leaf.id) : null,
    category_raw: leaf?.name ?? null,
    category_path: [...categories].reverse().map((c) => c.name),

    // Precio
    currency: item.prices?.currency_code || currency,
    price,
    list_price: listPrice,
    discount_percent: listPrice !== null && price !== null ? round2(((listPrice - price) / listPrice) * 100) : null,
    discount_amount: listPrice !== null && price !== null ? round2(listPrice - price) : null,
    tax_included: true,

    // Disponibilidad
    availability,
    in_stock: item.is_in_stock,
    // Ver cabecera: no hay campo exacto de stock, se estima del texto.
    stock_quantity: parseStockFromText(item),

    // Reputacion. review_count=0 hace que el promedio quede en null, no en 0 estrellas.
    rating_average: reviewCount > 0 ? round2(Number(item.average_rating)) : null,
    rating_count: reviewCount,

    // Medios
    primary_image_url: item.images?.[0]?.src ?? null,
    images: mapImages(item),
    // Ver cabecera: ningun producto muestreado fue variable; sin datos reales
    // que verificar, no se mapea variations/price_range.
    variants: [],

    // Datos libres
    attributes: {
      attributesRaw: attributes,
      weight: item.weight || null,
      dimensions: item.dimensions ?? null,
      isPurchasable: item.is_purchasable,
    },
    badges,

    raw: {
      id,
      name,
      sku: item.sku,
      permalink: item.permalink,
      type: item.type,
      prices: item.prices,
      categories,
      attributes,
      stock_availability: item.stock_availability,
      is_in_stock: item.is_in_stock,
      is_on_backorder: item.is_on_backorder,
      average_rating: item.average_rating,
      review_count: item.review_count,
    },
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): AcosaConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };
  const pageSize = Number(raw.pageSize);

  return {
    apiBaseUrl: str('apiBaseUrl', DEFAULTS.apiBaseUrl).replace(/\/+$/, ''),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    categoryId: typeof raw.categoryId === 'string' && raw.categoryId.trim() ? raw.categoryId.trim() : null,
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const acosaStrategy: ScrapeStrategy = {
  key: 'acosa',
  label: 'ACOSA (WooCommerce Store API)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categoryId',
      label: 'Id de categoria',
      example: '16442',
      description: 'Solo para targets de tipo categoria: id numerico de la categoria en WooCommerce.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '100',
      description: 'Maximo aceptado por la Store API: 100.',
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

    const products: NormalizedProduct[] = [];
    const categoryMap = new Map<string, NormalizedCategory>();
    const seen = new Set<string>();
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let page = 1;
    let pagesFetched = 0;

    while (pagesFetched < maxPages) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'products', message: 'Corrida abortada por limite de tiempo' });
        break;
      }

      const params = new URLSearchParams({
        per_page: String(config.pageSize),
        page: String(page),
        orderby: 'id',
        order: 'asc',
      });
      if (config.categoryId) params.set('category', config.categoryId);

      let batch: WcProduct[];
      try {
        // Se usa getText (no getJson): la respuesta trae un BOM UTF-8 al
        // inicio que JSON.parse no tolera (ver cabecera).
        const text = await ctx.http.getText(`${config.apiBaseUrl}/products?${params.toString()}`, {
          headers: { Cookie: BX_VERIFY_COOKIE },
        });
        batch = JSON.parse(stripBom(text)) as WcProduct[];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'products', message, meta: { page, pageSize: config.pageSize } });
        ctx.log('error', `Fallo la pagina ${page}: ${message}`);
        break;
      }

      pagesFetched += 1;
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const item of batch) {
        const mapped = mapAcosaProduct(item, currency);
        if (!mapped) continue;
        if (config.syncCategories && item.categories) {
          collectCategories(item.categories, categoryMap);
        }
        // La API puede repetir un articulo entre paginas; se queda el primero.
        if (!seen.has(mapped.external_id)) {
          seen.add(mapped.external_id);
          products.push(mapped);
        }
      }

      if (batch.length < config.pageSize) break;
      page += 1;
    }

    return {
      products,
      categories: categoryMap.size > 0 ? [...categoryMap.values()] : undefined,
      pagesFetched,
      errors,
      stats: {
        categoryId: config.categoryId,
        pageSize: config.pageSize,
      },
    };
  },
};
