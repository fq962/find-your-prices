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
 * Estrategia de scraping para RadioShack Honduras
 * (https://www.radioshackla.com/honduras/).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * radioshackla.com es Adobe Commerce (Magento 2, tema Luma) sobre la
 * plataforma multi-pais de Grupo Unicomer. A diferencia de Diunsa/Jetstereo el
 * html SI trae los productos de la grilla (Magento renderiza en servidor),
 * pero parsearlo seria trabajo tirado: el sitio expone GraphQL publico y sin
 * autenticacion (el mismo que usa el propio storefront para busqueda/PLP), con
 * mucha mas informacion que la tarjeta visual: descripcion completa, galeria
 * de imagenes, descuento ya calculado en servidor y la categoria completa
 * raiz->hoja de cada articulo.
 *
 * Endpoint usado (publico, sin token, header obligatorio):
 *   POST {webBaseUrl}/graphql
 *   Header: Store: rso_honduras_sv
 *
 * El header "Store" es obligatorio: sin el, el endpoint responde con la
 * tienda global en USD en vez de la de Honduras (comprobado: sin header
 * storeConfig.store_code = "default", con el header = "rso_honduras_sv").
 * Es el mismo dato que el storefront deja en
 * `magentoStorefrontEvents.context` embebido en el html de inicio.
 *
 * Notas de campo verificadas contra el endpoint (2026-09-09):
 *
 *   - `products(search: "")` sin filtro trae el catalogo completo (782
 *     articulos): igual que el `query:""` de Jetstereo o el `groupCode:"0"`
 *     de Diunsa, un query vacio actua como "traer todo". `search` o `filter`
 *     son obligatorios para Magento, pero un string vacio cuenta como
 *     `search` provisto.
 *
 *   - pageSize maximo REAL = 500, pero la API no lo dice: pedir 501 o mas no
 *     tira error, responde 200 con total_count=0 y items=[]. Es mas peligroso
 *     que el 400 explicito de Diunsa/Jetstereo porque parece una corrida
 *     exitosa sin resultados. Verificado con busqueda binaria (500 = ultimo
 *     valor que funciona, 501 ya rompe).
 *
 *   - El catalogo completo (782/782, las dos paginas) vino 100% IN_STOCK: el
 *     indice de busqueda de Magento excluye lo agotado por configuracion de
 *     la tienda. El scraper no puede recuperar productos sin stock por esta
 *     via; se documenta como limite conocido, no se intenta rodear.
 *
 *   - No hay campo "id" en el esquema de ProductInterface expuesto por
 *     introspeccion: se usa `sku` como identificador estable (es unico, y es
 *     el mismo numero que aparece al final de la url publica).
 *
 *   - `custom_attributesV2` (donde viviria la marca, atributo "marca" visible
 *     como filtro/orden) responde "Internal server error" para cualquier
 *     variante de consulta probada: es un bug del lado del servidor de esta
 *     tienda, no un error de sintaxis. Se deja `brand_raw` en null en vez de
 *     insistir contra un endpoint que devuelve 500.
 *
 *   - `rating_summary` viene en escala 0-100 (documentado por Adobe), no en
 *     estrellas: se divide entre 20. Igual que Diunsa, solo se guarda si
 *     `review_count > 0` para no inventar una valoracion de 0 estrellas.
 *
 *   - `categories` de un producto viene ordenado raiz -> hoja (verificado:
 *     "Productos" -> "Audio" -> "Audifonos" -> "Audifonos inalambricos"), con
 *     `breadcrumbs` de longitud creciente en cada nivel. Da la jerarquia
 *     completa sin pedir un endpoint aparte.
 *
 *   - Los nombres traen espacios sueltos al inicio/final (ej.
 *     " Almohadilla para Mouse..."): se recortan.
 *
 *   - `sort` solo acepta name/price/position/relevance/marca, no sku. Se
 *     ordena por nombre para que la paginacion sea estable (verificado:
 *     mismo resultado en llamadas repetidas, cero solapamiento entre
 *     paginas, 782 unicos en las dos paginas).
 */

// -----------------------------------------------------------------------------
// Respuesta de GraphQL (interfaces locales, solo lo que se consume)
// -----------------------------------------------------------------------------

interface GqlMoney {
  value: number;
  currency: string;
}
interface GqlDiscount {
  amount_off: number;
  percent_off: number;
}
interface GqlPriceRange {
  minimum_price: {
    regular_price: GqlMoney;
    final_price: GqlMoney;
    discount: GqlDiscount | null;
  };
}
interface GqlCategoryRef {
  uid: string;
  name: string;
  url_path: string | null;
}
interface GqlMediaItem {
  url: string;
  label: string | null;
  position: number | null;
  disabled: boolean | null;
}
interface GqlProduct {
  sku: string;
  uid: string;
  name: string;
  canonical_url: string | null;
  url_key: string | null;
  stock_status: 'IN_STOCK' | 'OUT_OF_STOCK' | null;
  quantity: number | null;
  only_x_left_in_stock: number | null;
  rating_summary: number;
  review_count: number;
  meta_title: string | null;
  meta_description: string | null;
  description: { html: string } | null;
  short_description: { html: string } | null;
  image: { url: string; label: string | null } | null;
  media_gallery: GqlMediaItem[] | null;
  price_range: GqlPriceRange;
  categories: GqlCategoryRef[] | null;
}

interface GqlProductsResponse {
  data?: {
    products: {
      total_count: number;
      page_info: { total_pages: number; current_page: number };
      items: GqlProduct[];
    } | null;
  };
  errors?: Array<{ message: string }>;
}

// -----------------------------------------------------------------------------
// Consulta GraphQL. `filter` viaja como variable para no armar strings a mano.
// -----------------------------------------------------------------------------

const PRODUCTS_QUERY = `
  query FindYourPricesCatalog($search: String!, $pageSize: Int!, $currentPage: Int!, $filter: ProductAttributeFilterInput) {
    products(search: $search, pageSize: $pageSize, currentPage: $currentPage, sort: { name: ASC }, filter: $filter) {
      total_count
      page_info { total_pages current_page }
      items {
        sku
        uid
        name
        canonical_url
        url_key
        stock_status
        quantity
        only_x_left_in_stock
        rating_summary
        review_count
        meta_title
        meta_description
        description { html }
        short_description { html }
        image { url label }
        media_gallery { url label position disabled }
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
            discount { amount_off percent_off }
          }
        }
        categories { uid name url_path }
      }
    }
  }
`;

// -----------------------------------------------------------------------------
// Valores por defecto
// -----------------------------------------------------------------------------

const DEFAULTS = {
  graphqlUrl: 'https://www.radioshackla.com/honduras/graphql',
  storeCode: 'rso_honduras_sv',
  webBaseUrl: 'https://www.radioshackla.com/honduras',
  pageSize: 500,
} as const;

/**
 * Limite REAL de la API: no lo declara, pero pedir mas devuelve total_count 0
 * en vez de error (ver cabecera). No confundir con un 400 explicito.
 */
const MAX_PAGE_SIZE = 500;

/** Tope de paginas de una corrida. El catalogo real ronda 2 paginas a 500. */
const MAX_PAGES_HARD_LIMIT = 20;

interface RadioShackConfig {
  graphqlUrl: string;
  storeCode: string;
  webBaseUrl: string;
  pageSize: number;
  /** Solo para targets de tipo categoria: filtra por category_url_path exacto (ej. "c/audio/audifonos"). */
  categoryUrlPath: string | null;
  syncCategories: boolean;
}

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para poder probarlas sin red)
// -----------------------------------------------------------------------------

export function round2(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function toAvailability(status: GqlProduct['stock_status']): AvailabilityStatus {
  if (status === 'IN_STOCK') return 'in_stock';
  if (status === 'OUT_OF_STOCK') return 'out_of_stock';
  return 'unknown';
}

/** Las descripciones de Magento vienen en WYSIWYG html. */
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

/** La url publica: canonical_url ya viene sin dominio ni slash inicial. */
export function buildRadioShackUrl(item: Pick<GqlProduct, 'canonical_url' | 'url_key'>, webBaseUrl: string): string | null {
  const base = webBaseUrl.replace(/\/+$/, '');
  if (item.canonical_url) return `${base}/${item.canonical_url.replace(/^\/+/, '')}`;
  if (item.url_key) return `${base}/${item.url_key}/p`;
  return null;
}

/** La categoria mas especifica es la ultima del array raiz -> hoja. */
function leafCategory(categories: GqlCategoryRef[]): GqlCategoryRef | null {
  return categories.length > 0 ? categories[categories.length - 1] : null;
}

/** Construye el arbol de categorias a partir de lo que traen los productos. */
function collectCategories(
  categories: GqlCategoryRef[],
  into: Map<string, NormalizedCategory>,
  webBaseUrl: string,
): void {
  let parentId: string | null = null;
  for (const cat of categories) {
    if (!into.has(cat.uid)) {
      into.set(cat.uid, {
        external_id: cat.uid,
        name: cat.name,
        external_parent_id: parentId,
        slug: cat.url_path,
        url: cat.url_path ? `${webBaseUrl.replace(/\/+$/, '')}/${cat.url_path}` : null,
        raw: cat as unknown as Record<string, unknown>,
      });
    }
    parentId = cat.uid;
  }
}

function mapImages(item: GqlProduct, name: string): NormalizedImage[] {
  const gallery = (item.media_gallery ?? []).filter((m) => !m.disabled && m.url);
  if (gallery.length > 0) {
    return gallery.map((m, index) => ({
      url: m.url,
      position: m.position ?? index,
      is_primary: index === 0,
      alt_text: m.label ?? name,
    }));
  }
  if (item.image?.url) {
    return [{ url: item.image.url, position: 0, is_primary: true, alt_text: item.image.label ?? name }];
  }
  return [];
}

/** Traduce un producto de Magento (GraphQL) al contrato comun del sistema. */
export function mapRadioShackProduct(
  item: GqlProduct,
  config: Pick<RadioShackConfig, 'webBaseUrl'>,
  currency: string,
): NormalizedProduct | null {
  const sku = item.sku;
  const name = item.name?.trim();
  const url = buildRadioShackUrl(item, config.webBaseUrl);
  if (!sku || !name || !url) return null;

  const minPrice = item.price_range?.minimum_price;
  const regular = minPrice?.regular_price?.value ?? null;
  const final = minPrice?.final_price?.value ?? null;
  // "regular" repite a "final" sin rebaja de verdad: solo cuenta si es mayor.
  const listPrice = regular !== null && final !== null && regular > final + 0.01 ? round2(regular) : null;
  const discount = minPrice?.discount;

  const categories = item.categories ?? [];
  const leaf = leafCategory(categories);

  const availability = toAvailability(item.stock_status);
  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (availability === 'out_of_stock') badges.push('agotado');

  const images = mapImages(item, name);

  return {
    // Identidad. No hay "id" en el esquema; sku es unico y estable.
    external_id: sku,
    sku,
    name,
    url,
    slug: item.url_key ?? null,

    // Contenido
    description: stripHtml(item.description?.html) || null,
    short_description: stripHtml(item.short_description?.html) || null,
    // Ver cabecera: custom_attributesV2 (donde viviria la marca) responde 500
    // en esta tienda. No se inventa un valor.
    brand_raw: null,
    condition: 'new',

    // Clasificacion
    store_category_external_id: leaf?.uid ?? null,
    category_raw: leaf?.name ?? null,
    category_path: categories.map((c) => c.name),

    // Precio
    currency: minPrice?.final_price?.currency ?? currency,
    price: round2(final),
    list_price: listPrice,
    discount_percent: listPrice !== null ? discount?.percent_off ?? null : null,
    discount_amount: listPrice !== null ? round2(discount?.amount_off ?? null) : null,
    tax_included: true,

    // Disponibilidad. El indice de busqueda solo trae stock_status=IN_STOCK
    // en la practica (ver cabecera), pero se mapea igual por si un target de
    // categoria puntual llega a traer agotados.
    availability,
    in_stock: item.stock_status === 'IN_STOCK' ? true : item.stock_status === 'OUT_OF_STOCK' ? false : null,
    stock_quantity: item.quantity ?? item.only_x_left_in_stock ?? null,

    // Reputacion. rating_summary es 0-100 (Adobe), no estrellas: se pasa a 0-5.
    // review_count=0 hace que el promedio quede en null, no en 0 estrellas.
    rating_average: item.review_count > 0 ? round2(item.rating_summary / 20) : null,
    rating_count: item.review_count,

    // Medios
    primary_image_url: images[0]?.url ?? item.image?.url ?? null,
    images,

    // Datos libres
    attributes: {
      uid: item.uid,
      onlyXLeftInStock: item.only_x_left_in_stock,
    },
    badges,
    meta_title: item.meta_title ?? null,
    meta_description: item.meta_description ?? null,

    raw: {
      sku,
      name,
      canonical_url: item.canonical_url,
      url_key: item.url_key,
      stock_status: item.stock_status,
      quantity: item.quantity,
      only_x_left_in_stock: item.only_x_left_in_stock,
      rating_summary: item.rating_summary,
      review_count: item.review_count,
      price_range: item.price_range,
      categories,
    },
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): RadioShackConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };
  const pageSize = Number(raw.pageSize);

  return {
    graphqlUrl: str('graphqlUrl', DEFAULTS.graphqlUrl),
    storeCode: str('storeCode', DEFAULTS.storeCode),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    // La API no avisa si se pasa el limite real: nunca conviene arriesgar mas de 500.
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    categoryUrlPath:
      typeof raw.categoryUrlPath === 'string' && raw.categoryUrlPath.trim() ? raw.categoryUrlPath.trim() : null,
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const radioshackStrategy: ScrapeStrategy = {
  key: 'radioshack',
  label: 'RadioShack Honduras (Magento GraphQL)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categoryUrlPath',
      label: 'Ruta de categoria',
      example: 'c/audio/audifonos',
      description: 'Solo para targets de tipo categoria: valor de category_url_path (ver la url publica de la categoria).',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '500',
      description: 'Maximo real: 500. Pasarse no da error, devuelve 0 resultados (ver notas de la estrategia).',
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

    const filter = config.categoryUrlPath ? { category_url_path: { eq: config.categoryUrlPath } } : undefined;

    const products: NormalizedProduct[] = [];
    const categoryMap = new Map<string, NormalizedCategory>();
    const seen = new Set<string>();
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let page = 1;
    let pagesFetched = 0;
    let totalReported: number | undefined;

    while (pagesFetched < maxPages) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'graphql', message: 'Corrida abortada por limite de tiempo' });
        break;
      }

      let response: GqlProductsResponse;
      try {
        response = await ctx.http.postJson<GqlProductsResponse>(
          config.graphqlUrl,
          {
            query: PRODUCTS_QUERY,
            variables: { search: '', pageSize: config.pageSize, currentPage: page, filter },
          },
          { headers: { Store: config.storeCode } },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'graphql', message, meta: { page, pageSize: config.pageSize } });
        ctx.log('error', `Fallo la pagina ${page}: ${message}`);
        break;
      }

      if (response.errors && response.errors.length > 0) {
        const message = response.errors.map((e) => e.message).join('; ');
        errors.push({ stage: 'graphql', message, meta: { page } });
        ctx.log('error', `GraphQL devolvio errores en la pagina ${page}: ${message}`);
        break;
      }

      const productsPage = response.data?.products;
      if (!productsPage) {
        errors.push({ stage: 'graphql', message: 'Respuesta sin datos de productos', meta: { page } });
        break;
      }

      pagesFetched += 1;
      totalReported = productsPage.total_count ?? totalReported;

      const batch = productsPage.items ?? [];
      if (batch.length === 0) break;

      for (const item of batch) {
        const mapped = mapRadioShackProduct(item, config, currency);
        if (!mapped) continue;
        if (config.syncCategories && item.categories) {
          collectCategories(item.categories, categoryMap, config.webBaseUrl);
        }
        // Un articulo puede aparecer en el borde de dos paginas si el indice
        // cambia entre llamadas: se queda con la primera aparicion.
        if (!seen.has(mapped.external_id)) {
          seen.add(mapped.external_id);
          products.push(mapped);
        }
      }

      const totalPages = productsPage.page_info?.total_pages ?? page;
      if (page >= totalPages) break;
      if (batch.length < config.pageSize) break;
      page += 1;
    }

    if (totalReported !== undefined && products.length < totalReported) {
      ctx.log(
        'warn',
        `Se obtuvieron ${products.length} de ${totalReported} articulos que reporta GraphQL`,
      );
    }

    return {
      products,
      categories: categoryMap.size > 0 ? [...categoryMap.values()] : undefined,
      pagesFetched,
      totalReported,
      errors,
      stats: {
        categoryUrlPath: config.categoryUrlPath,
        pageSize: config.pageSize,
        totalReported,
      },
    };
  },
};
