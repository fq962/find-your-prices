import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  NormalizedVariant,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';

/**
 * Estrategia de scraping para Diunsa (https://www.diunsa.hn).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * diunsa.hn es una SPA de Angular. El html que devuelve el servidor trae solo
 * esqueletos de carga (`<app-product-skeleton>`); las tarjetas de producto las
 * pinta el navegador despues de llamar a una API JSON. Descargar la pagina con
 * fetch devuelve cero productos.
 *
 * Esa API es publica y sin autenticacion, y entrega bastante mas de lo que
 * muestra la tarjeta visual: codigo de barras, stock, impuesto, ficha tecnica,
 * variantes, garantias y la galeria completa de imagenes. Consumirla es mas
 * rapido, mas estable frente a rediseños y mas rico en datos.
 *
 * Endpoints usados:
 *   POST {apiBaseUrl}/material/paginate?skip=N&take=M
 *        body: { groupCode, officeCode, filter: {} }
 *        -> { totalItems, totalPages, data: [...] }
 *   GET  {apiBaseUrl}/material_group/get_cb/{companyId}
 *        -> arbol de categorias [{ code, name, parentCode, hasSubCategory }]
 *
 * Notas de campo verificadas contra el sitio:
 *   - take maximo = 1000; con 2000 la API responde 400.
 *   - groupCode "0" ("Todos") devuelve el catalogo completo (~8000 articulos).
 *   - La url publica de un producto se arma como
 *     /{slug(materialGroupName)}/{slug(name)}-{sufijo numerico de code sin ceros}
 *     Regla comprobada contra las 100 tarjetas de la pagina de Jugueteria.
 */

interface DiunsaConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  officeCode: string;
  companyId: string;
  pageSize: number;
  groupCode: string;
  syncCategories: boolean;
}

interface DiunsaImage {
  fileLink?: string;
  fileName?: string;
  displayName?: string;
  position?: number;
  id?: number;
  active?: string;
}

interface DiunsaVariant {
  code?: string;
  id?: number | string;
  name?: string;
  color?: string;
  size?: string;
  newPrice?: string | number;
  oldPrice?: string | number;
  stock?: number;
  [key: string]: unknown;
}

interface DiunsaItem {
  code: string;
  externalKeys?: { id?: number; code?: string; idSAP?: string };
  name: string;
  nameAlias?: string | null;
  description?: string | null;
  tax?: string | null;
  unitMeasureCode?: string | null;
  unitMeasureName?: string | null;
  ratingsCount?: number | null;
  ratingsValue?: number | null;
  discount?: string | null;
  oldPrice?: string | null;
  newPrice?: string | null;
  ahorroMasPrice?: string | null;
  availibilityCount?: number | null;
  cartCount?: number | null;
  specs?: unknown;
  colors?: unknown[];
  sizes?: unknown[];
  brandId?: number | null;
  brandName?: string | null;
  materialGroupCode?: string | null;
  materialGroupName?: string | null;
  mainParentGroupName?: string | null;
  images?: DiunsaImage[];
  variants?: DiunsaVariant[];
  stock?: number | null;
  minimunStock?: number | null;
  is_adult?: string | null;
  metatitle?: string | null;
  metadescription?: string | null;
  extraGuaranteeApply?: string | null;
  extraGuarantee?: unknown[];
  assistanceApply?: string | null;
  assistances?: unknown[];
  isToLiquidation?: boolean | null;
  barcode?: string | null;
  content?: string | null;
  [key: string]: unknown;
}

interface DiunsaPage {
  totalItems: number;
  totalPages: number;
  itemPerPage: number;
  currentPage: number;
  data: DiunsaItem[];
}

interface DiunsaCategory {
  code: string;
  name: string;
  parentCode?: string | null;
  hasSubCategory?: string | null;
  type_category?: string | null;
}

const DEFAULTS = {
  apiBaseUrl: 'https://apicsm.dapplications.tech/api/em',
  webBaseUrl: 'https://www.diunsa.hn',
  officeCode: '1',
  companyId: '1',
  pageSize: 500,
  groupCode: '0',
} as const;

/** Tope de seguridad: evita un bucle infinito si la API deja de paginar bien. */
const MAX_PAGES_HARD_LIMIT = 200;

// -----------------------------------------------------------------------------
// Utilidades de normalizacion
// -----------------------------------------------------------------------------

/**
 * Reproduce el slug que usa diunsa.hn en sus urls: sin acentos, sin apostrofes
 * (Gabby's -> gabbys, no gabby-s) y el resto a guiones.
 */
export function diunsaSlug(input: string | null | undefined): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento sueltas tras NFD
    .replace(/['‘’]/g, '') // Gabby's -> gabbys, no gabby-s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * El sufijo numerico de `code` es el id que aparece al final de la url publica.
 * '000000001-0010025869' -> '10025869'
 */
export function diunsaUrlId(code: string): string {
  const tail = String(code).split('-').pop() ?? '';
  const digits = tail.replace(/\D/g, '');
  return digits ? String(Number(digits)) : tail;
}

export function buildDiunsaProductUrl(item: DiunsaItem, webBaseUrl: string): string {
  const categorySegment = diunsaSlug(item.materialGroupName) || 'producto';
  const nameSegment = diunsaSlug(item.name);
  return `${webBaseUrl.replace(/\/+$/, '')}/${categorySegment}/${nameSegment}-${diunsaUrlId(item.code)}`;
}

/** Convierte los precios en string de la API a numero, o null si no es valido. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Valoraciones de Diunsa: NO se mapean, a propósito.
 *
 * Verificado sobre el catálogo completo: los 8083 artículos devuelven
 * exactamente ratingsValue=350 y ratingsCount=4, es decir 4.38/5 para todo.
 * No son valoraciones, es un valor de relleno de su API.
 *
 * Guardarlo en rating_average haría que el sitio mostrara "4.4 ★" en cada
 * ficha y que el orden "mejor valorados" fuera puro ruido. Un comparador de
 * precios vive de que la gente confíe en lo que ve; publicar reseñas que no
 * existen destruye eso por un dato que no aporta nada.
 *
 * El valor crudo sigue en `raw`, así que si algún día Diunsa publica
 * valoraciones de verdad, se reprocesa sin volver a scrapear. Para
 * reactivarlo: comprobar primero que la distribución tiene varianza real
 * (select distinct rating_average ...), no solo que el campo viene lleno.
 */

function toAvailability(stock: number | null, active: boolean): AvailabilityStatus {
  if (!active) return 'discontinued';
  if (stock === null) return 'unknown';
  if (stock <= 0) return 'out_of_stock';
  if (stock <= 5) return 'limited';
  return 'in_stock';
}

function mapImages(item: DiunsaItem): NormalizedImage[] {
  const images = Array.isArray(item.images) ? item.images : [];
  return images
    .filter((img) => typeof img.fileLink === 'string' && img.fileLink.length > 0)
    .map((img, index) => ({
      url: img.fileLink as string,
      external_id: img.id !== undefined ? String(img.id) : null,
      position: index,
      is_primary: index === 0,
      alt_text: img.displayName ?? img.fileName ?? item.name,
    }));
}

function mapVariants(item: DiunsaItem): NormalizedVariant[] {
  const variants = Array.isArray(item.variants) ? item.variants : [];
  const mapped: NormalizedVariant[] = [];

  for (const variant of variants) {
    const externalId = variant.code ?? (variant.id !== undefined ? String(variant.id) : null);
    // Sin identificador propio no hay como deduplicar la variante: se descarta.
    if (!externalId) continue;

    const stock = toNumber(variant.stock);
    mapped.push({
      external_id: String(externalId),
      name: variant.name ?? null,
      color: variant.color ?? null,
      size: variant.size ?? null,
      price: toNumber(variant.newPrice),
      list_price: toNumber(variant.oldPrice),
      stock_quantity: stock,
      in_stock: stock === null ? null : stock > 0,
      availability: toAvailability(stock, true),
      options: variant as Record<string, unknown>,
    });
  }

  return mapped;
}

/** Traduce un articulo de la API de Diunsa al contrato comun del sistema. */
export function mapDiunsaItem(
  item: DiunsaItem,
  config: Pick<DiunsaConfig, 'webBaseUrl'>,
  currency: string,
): NormalizedProduct | null {
  if (!item?.code || !item?.name) return null;

  const price = toNumber(item.newPrice);
  const oldPrice = toNumber(item.oldPrice);
  // Diunsa repite el precio en oldPrice cuando no hay descuento: solo cuenta
  // como precio de lista si de verdad es mayor.
  const listPrice = oldPrice !== null && price !== null && oldPrice > price ? oldPrice : null;
  const stock = toNumber(item.stock ?? item.availibilityCount);
  const images = mapImages(item);

  const badges: string[] = [];
  if (item.isToLiquidation) badges.push('liquidacion');
  if (listPrice !== null) badges.push('descuento');

  return {
    // Identidad
    external_id: item.code,
    external_code: item.externalKeys?.idSAP ?? null,
    sku: item.externalKeys?.code ?? null,
    barcode_raw: item.barcode ?? null,
    name: item.name,
    name_alias: item.nameAlias ?? null,
    url: buildDiunsaProductUrl(item, config.webBaseUrl),
    slug: `${diunsaSlug(item.name)}-${diunsaUrlId(item.code)}`,

    // Contenido
    description: item.description ?? null,
    brand_raw: item.brandName ?? null,
    condition: 'new',
    is_adult: item.is_adult === '1',

    // Clasificacion
    store_category_external_id: item.materialGroupCode ?? null,
    category_raw: item.materialGroupName ?? null,
    category_path: [item.mainParentGroupName, item.materialGroupName].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    ),

    // Precio
    currency,
    price,
    list_price: listPrice,
    discount_percent: listPrice !== null ? toNumber(item.discount) : null,
    discount_amount: listPrice !== null && price !== null ? Number((listPrice - price).toFixed(2)) : null,
    // "Ahorro Mas" es el precio con la tarjeta de la tienda.
    member_price: toNumber(item.ahorroMasPrice),
    unit_measure_code: item.unitMeasureCode ?? null,
    unit_measure_name: item.unitMeasureName ?? null,
    tax_rate: toNumber(item.tax),
    tax_included: true,

    // Disponibilidad
    availability: toAvailability(stock, true),
    in_stock: stock === null ? null : stock > 0,
    stock_quantity: stock,
    min_order_quantity: toNumber(item.cartCount),

    // Reputacion: ver DIUNSA_RATINGS_ARE_PLACEHOLDER arriba.
    rating_average: null,
    rating_count: null,

    // Medios
    primary_image_url: images[0]?.url ?? null,
    images,
    variants: mapVariants(item),

    // Postventa
    warranty_info: {
      extraGuaranteeApply: item.extraGuaranteeApply === '1',
      extraGuarantee: item.extraGuarantee ?? [],
      assistanceApply: item.assistanceApply === '1',
      assistances: item.assistances ?? [],
    },

    // Datos libres
    specs: (item.specs && typeof item.specs === 'object' ? item.specs : {}) as Record<string, unknown>,
    attributes: {
      brandId: item.brandId ?? null,
      // Se conservan para poder auditarlos sin volver a descargar el sitio.
      ratingsValueRaw: item.ratingsValue ?? null,
      ratingsCountRaw: item.ratingsCount ?? null,
      colors: item.colors ?? [],
      sizes: item.sizes ?? [],
      minimunStock: item.minimunStock ?? null,
      isToLiquidation: Boolean(item.isToLiquidation),
      content: item.content ?? null,
    },
    badges,
    meta_title: item.metatitle ?? null,
    meta_description: item.metadescription ?? null,

    raw: item as unknown as Record<string, unknown>,
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): DiunsaConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  const pageSize = Number(raw.pageSize);

  return {
    apiBaseUrl: str('apiBaseUrl', DEFAULTS.apiBaseUrl).replace(/\/+$/, ''),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl),
    officeCode: str('officeCode', DEFAULTS.officeCode),
    companyId: str('companyId', DEFAULTS.companyId),
    // La API rechaza take > 1000.
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 1000) : DEFAULTS.pageSize,
    groupCode: str('groupCode', DEFAULTS.groupCode),
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const diunsaStrategy: ScrapeStrategy = {
  key: 'diunsa',
  label: 'Diunsa (API JSON)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'groupCode',
      label: 'Codigo de categoria',
      required: true,
      example: '258',
      description: 'Codigo de la categoria en Diunsa. "0" = catalogo completo. 258 = Jugueteria.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '500',
      description: 'Maximo aceptado por la API: 1000.',
    },
    {
      key: 'officeCode',
      label: 'Codigo de sucursal',
      example: '1',
      description: 'Sucursal contra la que se cotizan precio y stock.',
    },
    {
      key: 'syncCategories',
      label: 'Sincronizar categorias',
      example: 'true',
      description: 'Descarga tambien el arbol de categorias de la tienda.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];

    // --- 1. Arbol de categorias (opcional, una sola peticion) -----------------
    let categories: NormalizedCategory[] | undefined;
    if (config.syncCategories) {
      try {
        const raw = await ctx.http.getJson<DiunsaCategory[]>(
          `${config.apiBaseUrl}/material_group/get_cb/${config.companyId}`,
        );
        categories = (Array.isArray(raw) ? raw : [])
          .filter((c) => c?.code && c?.name)
          .map((c) => ({
            external_id: String(c.code),
            name: c.name,
            // La raiz se marca a si misma como padre; se corta para no ciclar.
            external_parent_id:
              c.parentCode && String(c.parentCode) !== String(c.code) ? String(c.parentCode) : null,
            slug: diunsaSlug(c.name),
            url: `${config.webBaseUrl.replace(/\/+$/, '')}/${diunsaSlug(c.name)}`,
            raw: c as unknown as Record<string, unknown>,
          }));
        ctx.log('info', `Categorias sincronizadas: ${categories.length}`);
      } catch (error) {
        // No es fatal: sin categorias los productos igual se guardan.
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'categories', message });
        ctx.log('warn', `No se pudo leer el arbol de categorias: ${message}`);
      }
    }

    // --- 2. Paginado de productos --------------------------------------------
    const products: NormalizedProduct[] = [];
    const seen = new Set<string>();
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let skip = 0;
    let pagesFetched = 0;
    let totalReported: number | undefined;

    while (pagesFetched < maxPages) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo' });
        break;
      }

      const url = `${config.apiBaseUrl}/material/paginate?skip=${skip}&take=${config.pageSize}`;
      let page: DiunsaPage;
      try {
        page = await ctx.http.postJson<DiunsaPage>(url, {
          groupCode: config.groupCode,
          officeCode: config.officeCode,
          filter: {},
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'paginate', message, meta: { skip, take: config.pageSize } });
        ctx.log('error', `Fallo la pagina skip=${skip}: ${message}`);
        break;
      }

      pagesFetched += 1;
      totalReported = page.totalItems ?? totalReported;

      const batch = Array.isArray(page.data) ? page.data : [];
      if (batch.length === 0) break;

      for (const item of batch) {
        const mapped = mapDiunsaItem(item, config, currency);
        // La API puede repetir un articulo entre paginas; se queda el primero.
        if (mapped && !seen.has(mapped.external_id)) {
          seen.add(mapped.external_id);
          products.push(mapped);
        }
      }

      skip += config.pageSize;
      if (batch.length < config.pageSize) break;
      if (totalReported !== undefined && skip >= totalReported) break;
    }

    if (totalReported !== undefined && products.length < totalReported) {
      ctx.log(
        'warn',
        `Se obtuvieron ${products.length} de ${totalReported} articulos que reporta la tienda`,
      );
    }

    return {
      products,
      categories,
      pagesFetched,
      totalReported,
      errors,
      stats: {
        groupCode: config.groupCode,
        officeCode: config.officeCode,
        pageSize: config.pageSize,
        totalReported,
      },
    };
  },
};
