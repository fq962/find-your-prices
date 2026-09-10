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
 * Estrategia de scraping para Steren Honduras (https://www.steren.com.hn).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * steren.com.hn es Adobe Commerce (Magento 2, tema Luma). El html de categoria
 * SI trae los productos (Magento renderiza en servidor), pero igual que
 * RadioShack (mismo tipo de plataforma, tienda distinta) parsearlo seria
 * trabajo tirado: el sitio expone GraphQL publico y sin autenticacion, con
 * mucha mas informacion que la tarjeta visual (descripcion completa, galeria,
 * descuento ya calculado en servidor y categoria con jerarquia).
 *
 * Endpoint usado (publico, sin token, sin header de tienda):
 *   POST https://www.steren.com.hn/graphql
 *
 * A diferencia de RadioShack, esta tienda NO necesita header "Store": es una
 * instalacion de una sola tienda (storeConfig.store_code = "honduras_view" sin
 * mandar ningun header). Mandar uno de mas no rompe nada, pero no hace falta.
 *
 * Notas de campo verificadas contra el endpoint (2026-09-09):
 *
 *   - `search: ""` sin filtro trae el catalogo completo: 1916 articulos
 *     (verificado con dos formas distintas de pedir "todo" -- `search: ""` y
 *     un filtro de precio 0-9999999 -- y ambas dan el mismo total_count).
 *     `search` o `filter` son obligatorios para Magento, pero un string vacio
 *     cuenta como `search` provisto.
 *
 *   - pageSize maximo REAL = 300. A diferencia de RadioShack (que responde 200
 *     con 0 resultados si te pasas), esta tienda SI avisa: 301 responde 400
 *     explicito "Maximum pageSize is 300".
 *
 *   - Ninguna categoria "carrito" (`category_id`) cubre el catalogo completo:
 *     la mas grande ("Envios Gratis HN", id 770) trae 1557 de 1916. Por eso el
 *     full_catalog usa `search: ""` sin filtro, no un id de categoria grande.
 *
 *   - No hay campo "id" documentado en el esquema (no aparece en introspeccion
 *     de ProductInterface), asi que se usa `sku` como identificador estable:
 *     es unico en las 1916 muestras relevadas y es el mismo dato que aparece
 *     en la ficha tecnica visible al cliente.
 *
 *   - `canonical_url` vino `null` en las 1916 muestras relevadas (a diferencia
 *     de RadioShack, que si lo entrega): hay que armar la url publica a mano.
 *     El patron es simple y sin trampa de slug, porque Magento ya resuelve
 *     `url_key` en el indice: `{webBaseUrl}/{url_key}{url_suffix}`, con
 *     `url_suffix` siempre en ".html" (verificado contra los enlaces reales
 *     del menu de inicio).
 *
 *   - `categories` de un producto NO viene ordenado raiz -> hoja como en
 *     RadioShack: mezcla categorias de catalogo real con categorias de
 *     marketing/promocion ("Envios Gratis", "Envios Gratis HN") en cualquier
 *     posicion. Lo unico confiable es el campo `level`: la categoria mas
 *     especifica es la de `level` mas alto, y su ancestro real es cualquier
 *     otra categoria del array cuyo `url_path` sea un prefijo de segmento del
 *     de la hoja (ej. hoja "audio/bocinas-amplificadas" con ancestro
 *     "audio"). Asi se separa la jerarquia real de las etiquetas de
 *     marketing sin adivinar por posicion.
 *
 *   - `manufacturer` esta en el esquema pero vino `null` en las 1916 muestras
 *     relevadas, y aunque tuviera valor es un id de opcion de atributo (tipo
 *     Int), no una etiqueta resoluble por este endpoint. Se deja `brand_raw`
 *     en null en vez de guardar un numero sin sentido (mismo criterio que
 *     RadioShack con su atributo de marca roto).
 *
 *   - `rating_summary` viene en escala 0-100 (documentado por Adobe), no en
 *     estrellas: se divide entre 20. Se guarda solo si `review_count > 0`
 *     para no inventar una valoracion de 0 estrellas (538/1916 articulos
 *     relevados traen alguna resena).
 *
 *   - Descuentos reales son raros pero existen (2/1916 en el relevamiento):
 *     `discount { amount_off percent_off }` ya viene calculado por el
 *     servidor, igual que RadioShack. Se usa tal cual, solo cuando
 *     `regular_price` es de verdad mayor que `final_price`.
 *
 *   - El catalogo trae articulos agotados (`stock_status: OUT_OF_STOCK`, 52 de
 *     1916 en el relevamiento): a diferencia de RadioShack, el indice de
 *     busqueda de esta tienda no los excluye. No hace falta filtrar aparte
 *     para verlos.
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
  id: number;
  name: string;
  url_path: string | null;
  level: number | null;
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
  url_key: string | null;
  url_suffix: string | null;
  canonical_url: string | null;
  manufacturer: number | null;
  stock_status: 'IN_STOCK' | 'OUT_OF_STOCK' | null;
  only_x_left_in_stock: number | null;
  rating_summary: number;
  review_count: number;
  meta_title: string | null;
  meta_description: string | null;
  description: { html: string } | null;
  short_description: { html: string } | null;
  thumbnail: { url: string; label: string | null } | null;
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
        url_key
        url_suffix
        canonical_url
        manufacturer
        stock_status
        only_x_left_in_stock
        rating_summary
        review_count
        meta_title
        meta_description
        description { html }
        short_description { html }
        thumbnail { url label }
        media_gallery { url label position disabled }
        price_range {
          minimum_price {
            regular_price { value currency }
            final_price { value currency }
            discount { amount_off percent_off }
          }
        }
        categories { id name url_path level }
      }
    }
  }
`;

// -----------------------------------------------------------------------------
// Valores por defecto
// -----------------------------------------------------------------------------

const DEFAULTS = {
  graphqlUrl: 'https://www.steren.com.hn/graphql',
  webBaseUrl: 'https://www.steren.com.hn',
  pageSize: 300,
} as const;

/** Limite real del endpoint: 301 responde 400 "Maximum pageSize is 300". */
const MAX_PAGE_SIZE = 300;

/** Tope de paginas de una corrida. El catalogo real ronda 7 paginas a 300. */
const MAX_PAGES_HARD_LIMIT = 40;

interface SterenConfig {
  graphqlUrl: string;
  webBaseUrl: string;
  pageSize: number;
  /** Solo para targets de tipo categoria: id numerico de category_id en Magento. */
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

/** La url publica: canonical_url siempre vino null (ver cabecera), se arma desde url_key. */
export function buildSterenUrl(
  item: Pick<GqlProduct, 'canonical_url' | 'url_key' | 'url_suffix'>,
  webBaseUrl: string,
): string | null {
  const base = webBaseUrl.replace(/\/+$/, '');
  if (item.canonical_url) return `${base}/${item.canonical_url.replace(/^\/+/, '')}`;
  if (item.url_key) return `${base}/${item.url_key}${item.url_suffix ?? '.html'}`;
  return null;
}

/**
 * Un `url_path` es ancestro de otro si es exactamente ese path o un prefijo
 * de segmento completo (no una coincidencia parcial de texto).
 */
function isAncestorPath(ancestorPath: string, path: string): boolean {
  return path === ancestorPath || path.startsWith(`${ancestorPath}/`);
}

/**
 * La categoria mas especifica es la de `level` mas alto (ver cabecera: el
 * orden del array mezcla catalogo real con etiquetas de marketing). Empate a
 * nivel: se queda con el `url_path` mas largo.
 */
export function leafCategory(categories: GqlCategoryRef[]): GqlCategoryRef | null {
  let best: GqlCategoryRef | null = null;
  for (const cat of categories) {
    if (cat.level === null) continue;
    if (!best || best.level === null) {
      best = cat;
      continue;
    }
    if (cat.level > best.level) {
      best = cat;
    } else if (cat.level === best.level && (cat.url_path?.length ?? 0) > (best.url_path?.length ?? 0)) {
      best = cat;
    }
  }
  return best;
}

/** Ancestros reales de la hoja (excluye categorias de marketing sin relacion de path), raiz -> hoja. */
export function categoryPathFor(categories: GqlCategoryRef[], leaf: GqlCategoryRef | null): string[] {
  if (!leaf) return [];
  if (!leaf.url_path) return [leaf.name];
  return categories
    .filter((c) => c.url_path && isAncestorPath(c.url_path, leaf.url_path as string))
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    .map((c) => c.name);
}

/** Construye el arbol de categorias a partir de lo que traen los productos (parentesco por prefijo de url_path). */
function buildCategoryTree(raw: Map<string, GqlCategoryRef>, webBaseUrl: string): NormalizedCategory[] {
  const base = webBaseUrl.replace(/\/+$/, '');
  const byUrlPath = new Map<string, string>();
  for (const [externalId, cat] of raw) {
    if (cat.url_path) byUrlPath.set(cat.url_path, externalId);
  }
  return [...raw.entries()].map(([externalId, cat]) => {
    let parentId: string | null = null;
    if (cat.url_path?.includes('/')) {
      const parentPath = cat.url_path.slice(0, cat.url_path.lastIndexOf('/'));
      parentId = byUrlPath.get(parentPath) ?? null;
    }
    return {
      external_id: externalId,
      name: cat.name,
      external_parent_id: parentId,
      slug: cat.url_path,
      url: cat.url_path ? `${base}/${cat.url_path}` : null,
      level: cat.level ?? undefined,
      raw: cat as unknown as Record<string, unknown>,
    };
  });
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
  if (item.thumbnail?.url) {
    return [{ url: item.thumbnail.url, position: 0, is_primary: true, alt_text: item.thumbnail.label ?? name }];
  }
  return [];
}

/** Traduce un producto de Magento (GraphQL) al contrato comun del sistema. */
export function mapSterenProduct(
  item: GqlProduct,
  config: Pick<SterenConfig, 'webBaseUrl'>,
  currency: string,
): NormalizedProduct | null {
  const sku = item.sku;
  const name = item.name?.trim();
  const url = buildSterenUrl(item, config.webBaseUrl);
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
    // Identidad. No hay "id" en el esquema publicado; sku es unico y estable.
    external_id: sku,
    sku,
    name,
    url,
    slug: item.url_key ?? null,

    // Contenido
    description: stripHtml(item.description?.html) || null,
    short_description: stripHtml(item.short_description?.html) || null,
    // Ver cabecera: "manufacturer" es un id de opcion de atributo sin
    // resolver (y siempre vino null). No se inventa una marca.
    brand_raw: null,
    condition: 'new',

    // Clasificacion
    store_category_external_id: leaf ? String(leaf.id) : null,
    category_raw: leaf?.name ?? null,
    category_path: categoryPathFor(categories, leaf),

    // Precio
    currency: minPrice?.final_price?.currency ?? currency,
    price: round2(final),
    list_price: listPrice,
    discount_percent: listPrice !== null ? discount?.percent_off ?? null : null,
    discount_amount: listPrice !== null ? round2(discount?.amount_off ?? null) : null,
    tax_included: true,

    // Disponibilidad. A diferencia de RadioShack, el indice SI trae agotados.
    availability,
    in_stock: item.stock_status === 'IN_STOCK' ? true : item.stock_status === 'OUT_OF_STOCK' ? false : null,
    stock_quantity: item.only_x_left_in_stock ?? null,

    // Reputacion. rating_summary es 0-100 (Adobe), no estrellas: se pasa a 0-5.
    // review_count=0 hace que el promedio quede en null, no en 0 estrellas.
    rating_average: item.review_count > 0 ? round2(item.rating_summary / 20) : null,
    rating_count: item.review_count,

    // Medios
    primary_image_url: images[0]?.url ?? item.thumbnail?.url ?? null,
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
      url_suffix: item.url_suffix,
      stock_status: item.stock_status,
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

function readConfig(raw: Record<string, unknown>): SterenConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };
  const pageSize = Number(raw.pageSize);

  return {
    graphqlUrl: str('graphqlUrl', DEFAULTS.graphqlUrl),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    // 301 responde 400 explicito (ver cabecera): nunca conviene arriesgar mas de 300.
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    categoryId: typeof raw.categoryId === 'string' && raw.categoryId.trim() ? raw.categoryId.trim() : null,
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const sterenStrategy: ScrapeStrategy = {
  key: 'steren',
  label: 'Steren Honduras (Magento GraphQL)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categoryId',
      label: 'Id de categoria',
      example: '191',
      description: 'Solo para targets de tipo categoria: category_id numerico de Magento (ver categoryList en GraphQL).',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '300',
      description: 'Maximo real: 300. Pasarse responde 400 "Maximum pageSize is 300".',
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

    const filter = config.categoryId ? { category_id: { eq: config.categoryId } } : undefined;

    const products: NormalizedProduct[] = [];
    const categoryRaw = new Map<string, GqlCategoryRef>();
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
        response = await ctx.http.postJson<GqlProductsResponse>(config.graphqlUrl, {
          query: PRODUCTS_QUERY,
          variables: { search: '', pageSize: config.pageSize, currentPage: page, filter },
        });
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
        const mapped = mapSterenProduct(item, config, currency);
        if (!mapped) continue;
        if (config.syncCategories) {
          for (const cat of item.categories ?? []) {
            if (!categoryRaw.has(String(cat.id))) categoryRaw.set(String(cat.id), cat);
          }
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
      ctx.log('warn', `Se obtuvieron ${products.length} de ${totalReported} articulos que reporta GraphQL`);
    }

    return {
      products,
      categories: categoryRaw.size > 0 ? buildCategoryTree(categoryRaw, config.webBaseUrl) : undefined,
      pagesFetched,
      totalReported,
      errors,
      stats: {
        categoryId: config.categoryId,
        pageSize: config.pageSize,
        totalReported,
      },
    };
  },
};
