import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { toNumber, truncate } from './ladylee';

/**
 * Estrategia de scraping para Office Depot Honduras (https://www.officedepot.com.hn).
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-18)
 * ---------------------------------------------------------------------------
 * El sitio es un SAP Commerce (Hybris) Accelerator: el html trae los productos
 * renderizados en el servidor (`ACC.*`, `/_ui/responsive/...`), pero **no hace
 * falta parsearlo**. La misma tienda publica su API OCC v2 sin autenticacion:
 *
 *   GET {apiBaseUrl}/products/search?query=:name-asc&currentPage=N&pageSize=100&fields=...
 *       -> { products: [...], facets: [...], pagination: { totalResults, totalPages } }
 *   GET {apiBaseUrl}/catalogs/{catalogId}/{catalogVersion}?fields=FULL
 *       -> arbol completo de categorias (1040 nodos)
 *
 * (`/rest/v2/...` responde 404 en esta instalacion; la puerta buena es `/occ/v2/`.)
 *
 * Notas de campo verificadas contra el sitio:
 *   - `pageSize` tiene tope duro de 100, se pida lo que se pida. El catalogo
 *     completo son 4 056 articulos = 41 paginas, ~0.3 s cada una.
 *   - **El orden importa.** Con `query=:relevance` el barrido de 41 paginas
 *     devolvio 3 909 articulos distintos: el orden se reacomoda entre
 *     peticiones y se pierden ~150. Con `:name-asc` salen los 4 056 exactos.
 *   - `price` es el precio de lista y `discountedPrice` el que paga el cliente;
 *     son iguales cuando no hay rebaja (441 articulos con descuento real).
 *   - `fields=FULL` devuelve `categories: [{}, {}, {}]` (objetos vacios). Hay
 *     que pedir los campos a mano: `products(code,name,url,categories(name),...)`.
 *     Aun asi la busqueda solo entrega el **nombre** de la categoria, nunca su
 *     codigo: por eso se resuelve contra el arbol (ver `resolveOdCategoryCode`).
 *   - Las imagenes vienen con prefijo de la API (`/officedepotocc/v2/medias/...`)
 *     y con ese prefijo dan 404. El sitio las sirve en `/medias/...`, mismo
 *     token `context`. El token es estable entre corridas (verificado sobre
 *     3 909 articulos): no ensucia el hash de contenido.
 *   - La busqueda entrega un solo articulo grafico en tres tamanos
 *     (96 / 300 / 515 ftw). La galeria completa solo esta en la ficha, que
 *     costaria 4 056 peticiones extra: no se pide.
 *   - `description` trae "NOMBRE^|MARCA: x|MODELO: y|MPN: z|". De ahi salen
 *     `brand_raw`, `model` y `mpn`. 118 de 4 056 descripciones estan rotas en
 *     origen (latin-1 mal convertido: "TAMA�O"); esas se descartan, los
 *     campos ascii de la misma cadena se conservan.
 *   - La url publica viene servida (`/Categoria/Nombre/p/{code}`) y solo hay
 *     que anteponerle host + `/officedepotHN/en`. Coincide con el `<link
 *     rel="canonical">` de la ficha; no se reconstruye nada a mano.
 *   - robots.txt no prohibe `/occ/`, y la API responde 200 al user agent del
 *     bot, sin necesidad de disfrazarlo.
 *
 * ---------------------------------------------------------------------------
 * La parte dificil: a que categoria pertenece cada articulo
 * ---------------------------------------------------------------------------
 * La busqueda da nombres de categoria, no codigos, y el arbol tiene 213
 * nombres repetidos en ramas distintas ("Cartuchos de Tinta" cuelga de
 * 06-02-01-0 y de 13-02-01-0). El primer segmento de la url del producto es su
 * categoria primaria, asi que se resuelve en tres pasos, en este orden:
 *
 *   1. Por nombre: slug del segmento contra el arbol. 1 825 de 4 056 caen en
 *      un unico candidato.
 *   2. Por ascendencia: el resto de nombres que trae `categories` tienen que
 *      estar entre los ancestros del candidato. Resuelve otros 1 694.
 *   3. Por sondeo: para los 35 slugs que siguen ambiguos se consulta una vez
 *      por candidato `:category:<codigo>&pageSize=1` y se descartan los que no
 *      tienen articulos (ramas muertas del arbol). Si sobrevive mas de uno
 *      —"Resaltador" existe de verdad bajo Oficina y bajo Escolares— se toma
 *      el codigo menor: es arbitrario, pero **estable entre corridas**, que es
 *      lo que evita que el articulo cambie de categoria en cada barrido.
 *
 * Los codigos con segmentos de tres digitos (`02-025-621-622`) son ramas
 * viejas sin un solo articulo: se filtran antes de sondear.
 */

// -----------------------------------------------------------------------------
// Tipos de la respuesta de la tienda
// -----------------------------------------------------------------------------

interface OdPrice {
  value?: number | null;
  currencyIso?: string | null;
}

interface OdImage {
  format?: string;
  imageType?: string;
  url?: string;
  altText?: string | null;
  galleryIndex?: number;
}

export interface OdSearchProduct {
  code?: string;
  name?: string;
  url?: string;
  description?: string | null;
  categories?: Array<{ code?: string; name?: string }>;
  price?: OdPrice | null;
  discountedPrice?: OdPrice | null;
  images?: OdImage[];
  stock?: { stockLevel?: number | null; stockLevelStatus?: string | null } | null;
  purchasable?: boolean;
  availableForPickup?: boolean;
}

interface OdSearchPage {
  products?: OdSearchProduct[];
  pagination?: {
    currentPage?: number;
    pageSize?: number;
    totalPages?: number;
    totalResults?: number;
  };
}

interface OdCategoryNode {
  id?: string;
  name?: string;
  url?: string;
  subcategories?: OdCategoryNode[];
}

interface OdCatalogVersion {
  categories?: OdCategoryNode[];
}

// -----------------------------------------------------------------------------
// Configuracion
// -----------------------------------------------------------------------------

interface OfficedepotConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  /** Prefijo de idioma/sitio de las urls publicas. */
  sitePath: string;
  catalogId: string;
  catalogVersion: string;
  pageSize: number;
  /** Codigo de categoria de la tienda; vacio = catalogo completo. */
  category: string;
  syncCategories: boolean;
  /** Sondear las categorias ambiguas para descartar las ramas muertas. */
  resolveAmbiguousCategories: boolean;
}

const DEFAULTS: OfficedepotConfig = {
  apiBaseUrl: 'https://www.officedepot.com.hn/occ/v2/officedepotHN',
  webBaseUrl: 'https://www.officedepot.com.hn',
  sitePath: '/officedepotHN/en',
  catalogId: 'officedepotHNProductCatalog',
  catalogVersion: 'Online',
  pageSize: 100,
  category: '',
  syncCategories: true,
  resolveAmbiguousCategories: true,
};

/** Tope de la API, no una preferencia: pedir mas devuelve 100 igual. */
const MAX_PAGE_SIZE = 100;
/** Tope duro de paginas: el catalogo completo usa 41. */
const MAX_PAGES_HARD_LIMIT = 80;
/** Tope de sondeos de categoria por corrida; el catalogo completo usa ~60. */
const MAX_CATEGORY_PROBES = 150;
const MAX_DESCRIPTION_CHARS = 2000;

/** Campos que se piden a la busqueda. `FULL` vacia `categories`, ver cabecera. */
const SEARCH_FIELDS = [
  'products(code,name,url,description,categories(name),price(value,currencyIso)',
  ',discountedPrice(value,currencyIso),stock(FULL),images(FULL),purchasable,availableForPickup)',
  ',pagination(DEFAULT)',
].join('');

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

/** Slug comparable: sin acentos, minusculas y todo lo demas a guion. */
export function odSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Codigos como `02-025-621-622` son ramas viejas del arbol: ninguna tiene
 * articulos. Los vivos usan segmentos de uno o dos digitos.
 */
export function isLiveOdCategoryCode(code: string): boolean {
  return /^\d{1,2}(-\d{1,2}){3}$/.test(code);
}

/**
 * Descompone la `description` de la tienda.
 *
 * Formato observado: "\nTEXTO^|MARCA: x|MODELO: y|MPN: z|". El texto puede ser
 * el propio nombre del articulo (1 387 de 4 056) o una ficha de verdad.
 *
 * Las descripciones con U+FFFD vienen rotas desde el origen (el sitio tampoco
 * las muestra bien) y no hay forma de recuperar la letra perdida: se devuelve
 * `description: null` y se conservan marca, modelo y mpn, que son ascii.
 */
export function parseOdDescription(raw: string | null | undefined): {
  description: string | null;
  brand: string | null;
  model: string | null;
  mpn: string | null;
} {
  const text = (raw ?? '').trim();
  if (!text) return { description: null, brand: null, model: null, mpn: null };

  const [head, ...rest] = text.split('^|');
  const tail = rest.join('^|');

  const field = (label: string): string | null => {
    const match = tail.match(new RegExp(`(?:^|\\|)\\s*${label}\\s*:\\s*([^|]*)`, 'i'));
    const value = match?.[1]?.trim();
    return value && value !== '-' ? value : null;
  };

  // El separador de vinetas tambien se perdio en la conversion: los puntos
  // quedaron como '?'. Se normalizan a saltos de linea para que la ficha se lea.
  const body = head
    .replace(/\s*\?\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

  return {
    description: body && !body.includes('�') ? body : null,
    brand: field('MARCA'),
    model: field('MODELO'),
    mpn: field('MPN'),
  };
}

/**
 * La API devuelve las imagenes bajo `/officedepotocc/v2/medias/...`, que da 404.
 * El sitio las sirve en `/medias/...` con el mismo token `context`.
 */
export function odImageUrl(url: string, webBaseUrl: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const path = url.replace(/^\/officedepot[a-z]*occ\/v\d+/, '');
  return `${webBaseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** El ancho va en el nombre del archivo: `515ftw-1201000246.jpg`, `x.gif-300ftw`. */
function imageWidth(url: string): number {
  const match = url.match(/(\d{2,4})ftw/);
  return match ? Number(match[1]) : 0;
}

/**
 * La busqueda entrega el mismo articulo grafico en tres tamanos. Se guarda uno
 * solo, el mas grande: guardar los tres llenaria la galeria de duplicados.
 */
export function mapOdImages(product: OdSearchProduct, webBaseUrl: string): NormalizedImage[] {
  const images = (product.images ?? []).filter((i) => typeof i.url === 'string' && i.url.length > 0);
  if (images.length === 0) return [];

  const byAsset = new Map<string, OdImage>();
  for (const image of images) {
    // Clave = galeria + nombre del archivo sin el sufijo de tamano.
    const key = `${image.galleryIndex ?? 0}:${(image.url as string).split('?')[0].replace(/-?\d{2,4}ftw/, '')}`;
    const current = byAsset.get(key);
    if (!current || imageWidth(image.url as string) > imageWidth(current.url as string)) {
      byAsset.set(key, image);
    }
  }

  return [...byAsset.values()]
    .sort((a, b) => (a.galleryIndex ?? 0) - (b.galleryIndex ?? 0))
    .map((image, index) => ({
      url: odImageUrl(image.url as string, webBaseUrl),
      position: index,
      is_primary: index === 0,
      alt_text: image.altText ?? product.name ?? null,
      width: imageWidth(image.url as string) || null,
    }));
}

function toAvailability(status: string | null | undefined, purchasable: boolean | undefined): AvailabilityStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'instock':
      return purchasable === false ? 'limited' : 'in_stock';
    case 'lowstock':
      return 'limited';
    case 'outofstock':
      return 'out_of_stock';
    default:
      return 'unknown';
  }
}

/** Url publica: la que sirve la API, con host y prefijo de sitio delante. */
export function buildOdProductUrl(path: string, webBaseUrl: string, sitePath: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}${sitePath.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Primer segmento de la url: el nombre de la categoria primaria del articulo. */
export function odPrimaryCategorySlug(path: string): string | null {
  const first = path.replace(/^\/+/, '').split('/')[0];
  if (!first) return null;
  try {
    return odSlug(decodeURIComponent(first));
  } catch {
    return odSlug(first);
  }
}

// -----------------------------------------------------------------------------
// Arbol de categorias
// -----------------------------------------------------------------------------

export interface OdCategoryIndex {
  /** codigo -> nombre. */
  names: Map<string, string>;
  /** codigo -> codigo del padre. */
  parents: Map<string, string | null>;
  /** codigo -> url publica declarada por el catalogo. */
  urls: Map<string, string | null>;
  /** slug del nombre -> codigos que lo comparten. */
  bySlug: Map<string, string[]>;
}

/** Aplana el arbol del catalogo. Los nodos sin nombre se ignoran. */
export function indexOdCategories(nodes: OdCategoryNode[] | undefined): OdCategoryIndex {
  const index: OdCategoryIndex = {
    names: new Map(),
    parents: new Map(),
    urls: new Map(),
    bySlug: new Map(),
  };

  const walk = (list: OdCategoryNode[] | undefined, parent: string | null) => {
    for (const node of list ?? []) {
      const id = node.id;
      if (!id) continue;
      index.parents.set(id, parent);
      if (node.name) {
        index.names.set(id, node.name);
        index.urls.set(id, node.url ?? null);
        const slug = odSlug(node.name);
        const bucket = index.bySlug.get(slug);
        if (bucket) bucket.push(id);
        else index.bySlug.set(slug, [id]);
      }
      walk(node.subcategories, id);
    }
  };

  walk(nodes, null);
  for (const codes of index.bySlug.values()) codes.sort();
  return index;
}

/** Codigos de los ancestros, de la hoja hacia la raiz. */
export function odAncestors(index: OdCategoryIndex, code: string): string[] {
  const out: string[] = [];
  let parent = index.parents.get(code) ?? null;
  const guard = new Set<string>([code]);
  while (parent && !guard.has(parent)) {
    guard.add(parent);
    out.push(parent);
    parent = index.parents.get(parent) ?? null;
  }
  return out;
}

/**
 * Resuelve el codigo de categoria de un articulo. Devuelve el codigo cuando es
 * inequivoco, o la lista de candidatos cuando hace falta sondear la tienda.
 */
export function resolveOdCategoryCode(
  index: OdCategoryIndex,
  product: OdSearchProduct,
): { code: string | null; candidates: string[] } {
  const slug = odPrimaryCategorySlug(product.url ?? '');
  if (!slug) return { code: null, candidates: [] };

  const all = index.bySlug.get(slug) ?? [];
  if (all.length === 0) return { code: null, candidates: [] };
  if (all.length === 1) return { code: all[0], candidates: [] };

  // Los demas nombres que declara el articulo tienen que ser ancestros suyos.
  const others = new Set(
    (product.categories ?? [])
      .map((c) => odSlug(c.name ?? ''))
      .filter((s) => s.length > 0 && s !== slug),
  );

  const byAncestry = all.filter((code) => {
    const ancestors = new Set(odAncestors(index, code).map((c) => odSlug(index.names.get(c) ?? '')));
    return [...others].every((name) => ancestors.has(name));
  });

  const narrowed = byAncestry.length > 0 ? byAncestry : all;
  if (narrowed.length === 1) return { code: narrowed[0], candidates: [] };

  const live = narrowed.filter(isLiveOdCategoryCode);
  const finalists = live.length > 0 ? live : narrowed;
  if (finalists.length === 1) return { code: finalists[0], candidates: [] };

  return { code: null, candidates: finalists };
}

// -----------------------------------------------------------------------------
// Mapeo del articulo
// -----------------------------------------------------------------------------

export function mapOdProduct(
  product: OdSearchProduct,
  options: { webBaseUrl: string; sitePath: string; currency: string },
  categoryCode: string | null = null,
  categoryPath: string[] = [],
): NormalizedProduct | null {
  if (!product?.code || !product?.name || !product?.url) return null;

  const listPriceRaw = toNumber(product.price?.value);
  const priceRaw = toNumber(product.discountedPrice?.value);
  // Cuando no hay rebaja la tienda repite el precio en los dos campos.
  const price = priceRaw ?? listPriceRaw;
  const listPrice = listPriceRaw !== null && price !== null && listPriceRaw > price ? listPriceRaw : null;

  const { description, brand, model, mpn } = parseOdDescription(product.description);
  const images = mapOdImages(product, options.webBaseUrl);
  const stockLevel = toNumber(product.stock?.stockLevel);
  const availability = toAvailability(product.stock?.stockLevelStatus, product.purchasable);
  const leafName = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : null;

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (product.availableForPickup) badges.push('retiro-en-tienda');

  return {
    // Identidad: `code` es el codigo de articulo de Hybris y es el que va en la
    // url publica. No cambia cuando editan el nombre.
    external_id: product.code,
    sku: product.code,
    mpn,
    name: product.name.trim(),
    url: buildOdProductUrl(product.url, options.webBaseUrl, options.sitePath),

    // Contenido
    description: description ? truncate(description, MAX_DESCRIPTION_CHARS) : null,
    brand_raw: brand,
    model,
    condition: 'new',

    // Clasificacion
    store_category_external_id: categoryCode,
    category_raw: leafName,
    category_path: categoryPath,

    // Precio
    currency: product.discountedPrice?.currencyIso ?? product.price?.currencyIso ?? options.currency,
    price,
    list_price: listPrice,
    discount_amount: listPrice !== null && price !== null ? Number((listPrice - price).toFixed(2)) : null,
    discount_percent:
      listPrice !== null && price !== null && listPrice > 0
        ? Number((((listPrice - price) / listPrice) * 100).toFixed(2))
        : null,
    tax_included: true,

    // Disponibilidad
    availability,
    in_stock: stockLevel === null ? availability === 'in_stock' : stockLevel > 0,
    stock_quantity: stockLevel,

    // Medios
    primary_image_url: images[0]?.url ?? null,
    images,

    badges,
    // Sin raw: la migracion 0026 lo descarta.
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): OfficedepotConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };
  const pageSize = Number(raw.pageSize);

  return {
    apiBaseUrl: str('apiBaseUrl', DEFAULTS.apiBaseUrl).replace(/\/+$/, ''),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    sitePath: str('sitePath', DEFAULTS.sitePath),
    catalogId: str('catalogId', DEFAULTS.catalogId),
    catalogVersion: str('catalogVersion', DEFAULTS.catalogVersion),
    pageSize:
      Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    category: str('category', DEFAULTS.category),
    syncCategories: raw.syncCategories !== false,
    resolveAmbiguousCategories: raw.resolveAmbiguousCategories !== false,
  };
}

/** `:name-asc` fija el orden; con `:relevance` el barrido pierde articulos. */
function buildQuery(category: string): string {
  return category ? `:name-asc:category:${category}` : ':name-asc';
}

function searchUrl(config: OfficedepotConfig, query: string, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    query,
    currentPage: String(page),
    pageSize: String(pageSize),
    fields: SEARCH_FIELDS,
  });
  return `${config.apiBaseUrl}/products/search?${params.toString()}`;
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const officedepotStrategy: ScrapeStrategy = {
  key: 'officedepot',
  label: 'Office Depot Honduras (SAP Commerce OCC v2)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'category',
      label: 'Codigo de categoria',
      example: '02-01-0-0',
      description:
        'Codigo de la tienda (el que va en /c/<codigo>). Vacio = catalogo completo: 4 056 articulos en 41 paginas.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '100',
      description: 'La API topa en 100 aunque se pida mas.',
    },
    {
      key: 'syncCategories',
      label: 'Sincronizar categorias',
      example: 'true',
      description: 'Descarga el arbol del catalogo para atribuir la categoria de cada articulo.',
    },
    {
      key: 'resolveAmbiguousCategories',
      label: 'Sondear categorias ambiguas',
      example: 'true',
      description:
        'Consulta una vez cada categoria candidata cuando el nombre se repite en el arbol, para descartar las ramas sin articulos (~60 peticiones cortas).',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);
    const query = buildQuery(config.category);

    // 1) Arbol de categorias. Sin el, los articulos se guardan sin clasificar,
    //    que es preferible a tumbar la corrida entera.
    let index: OdCategoryIndex = indexOdCategories([]);
    if (config.syncCategories) {
      const url = `${config.apiBaseUrl}/catalogs/${config.catalogId}/${config.catalogVersion}?fields=FULL`;
      try {
        const catalog = await ctx.http.getJson<OdCatalogVersion>(url);
        index = indexOdCategories(catalog.categories);
        ctx.log('info', `Arbol de categorias: ${index.names.size} nodos con nombre`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'categories', message });
        ctx.log('warn', `No se pudo leer el arbol de categorias: ${message}`);
      }
    }

    // 2) Barrido del catalogo.
    const raw: OdSearchProduct[] = [];
    const seen = new Set<string>();
    let pagesFetched = 0;
    let page = 0;
    let totalReported: number | undefined;

    while (pagesFetched < maxPages) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo', meta: { page } });
        break;
      }

      let response: OdSearchPage;
      try {
        response = await ctx.http.getJson<OdSearchPage>(searchUrl(config, query, page, config.pageSize));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'paginate', message, meta: { page } });
        ctx.log('error', `Fallo la pagina ${page}: ${message}`);
        break;
      }

      pagesFetched += 1;
      totalReported = toNumber(response.pagination?.totalResults) ?? totalReported;

      const batch = response.products ?? [];
      if (batch.length === 0) break;

      for (const item of batch) {
        if (!item.code || seen.has(item.code)) continue;
        seen.add(item.code);
        raw.push(item);
      }

      const totalPages = toNumber(response.pagination?.totalPages);
      page += 1;
      if (batch.length < config.pageSize) break;
      if (totalPages !== null && page >= totalPages) break;
    }

    // 3) Categoria de cada articulo. Primero lo que se resuelve sin red.
    const pending = new Map<string, string[]>();
    const resolved = new Map<string, string | null>();

    for (const item of raw) {
      const { code, candidates } = resolveOdCategoryCode(index, item);
      resolved.set(item.code as string, code);
      if (!code && candidates.length > 1) {
        pending.set(item.code as string, candidates);
      }
    }

    // 4) Sondeo de los candidatos ambiguos: una peticion corta por codigo.
    const probeCounts = new Map<string, number>();
    if (config.resolveAmbiguousCategories && pending.size > 0) {
      const toProbe = [...new Set([...pending.values()].flat())].sort();
      let probes = 0;

      for (const code of toProbe) {
        if (probes >= MAX_CATEGORY_PROBES || ctx.signal.aborted) break;
        probes += 1;
        const url = `${config.apiBaseUrl}/products/search?${new URLSearchParams({
          query: `:name-asc:category:${code}`,
          pageSize: '1',
          fields: 'pagination(DEFAULT)',
        }).toString()}`;
        try {
          const response = await ctx.http.getJson<OdSearchPage>(url);
          probeCounts.set(code, toNumber(response.pagination?.totalResults) ?? 0);
        } catch (error) {
          // Un sondeo fallido no es fatal: el articulo cae al desempate por
          // codigo menor, igual que si la categoria tuviera articulos.
          ctx.log('warn', `No se pudo sondear la categoria ${code}: ${String(error)}`);
        }
      }
      ctx.log('info', `Categorias ambiguas sondeadas: ${probes} para ${pending.size} articulos`);
    }

    for (const [productCode, candidates] of pending) {
      const withProducts = candidates.filter((code) => (probeCounts.get(code) ?? 1) > 0);
      // Desempate estable: el codigo menor. Un criterio que dependa del orden
      // de llegada haria que el articulo cambiara de categoria cada corrida.
      resolved.set(productCode, (withProducts.length > 0 ? withProducts : candidates)[0] ?? null);
    }

    // 5) Mapeo final.
    const products: NormalizedProduct[] = [];
    const usedCategories = new Map<string, number>();

    for (const item of raw) {
      const code = resolved.get(item.code as string) ?? null;
      const path = code
        ? [...odAncestors(index, code).reverse(), code]
            .map((c) => index.names.get(c) ?? '')
            .filter((name) => name.length > 0 && name !== 'Categoría' && name !== 'Todas')
        : (item.categories ?? []).map((c) => c.name ?? '').filter((name) => name.length > 0);

      const mapped = mapOdProduct(
        item,
        { webBaseUrl: config.webBaseUrl, sitePath: config.sitePath, currency },
        code,
        path,
      );
      if (!mapped) continue;
      products.push(mapped);
      if (code) usedCategories.set(code, (usedCategories.get(code) ?? 0) + 1);
    }

    // 6) Solo se publican las categorias que de verdad clasifican algo, con sus
    //    ancestros: el arbol entero trae cientos de ramas vacias.
    let categories: NormalizedCategory[] | undefined;
    if (index.names.size > 0 && usedCategories.size > 0) {
      const needed = new Set<string>();
      for (const code of usedCategories.keys()) {
        needed.add(code);
        for (const ancestor of odAncestors(index, code)) needed.add(ancestor);
      }

      categories = [...needed]
        .filter((code) => index.names.has(code))
        .map((code) => {
          const parent = index.parents.get(code) ?? null;
          return {
            external_id: code,
            name: index.names.get(code) as string,
            external_parent_id: parent && index.names.has(parent) ? parent : null,
            slug: odSlug(index.names.get(code) as string),
            url: index.urls.get(code)
              ? `${config.webBaseUrl}${config.sitePath}/${encodeURIComponent(
                  index.names.get(code) as string,
                )}/c/${code}`
              : null,
            level: odAncestors(index, code).length,
            product_count: usedCategories.get(code) ?? null,
          } satisfies NormalizedCategory;
        });
      ctx.log('info', `Categorias publicadas: ${categories.length}`);
    }

    // 7) Un barrido incompleto en un full_catalog daria de baja articulos vivos.
    if (totalReported !== undefined && products.length < totalReported) {
      ctx.log('warn', `Se obtuvieron ${products.length} de ${totalReported} articulos que reporta la tienda`);
      if (ctx.target.kind === 'full_catalog' && errors.length === 0) {
        errors.push({
          stage: 'paginate',
          message: `Barrido incompleto: ${products.length} de ${totalReported}`,
        });
      }
    }

    return {
      products,
      categories,
      pagesFetched,
      totalReported,
      errors,
      stats: {
        category: config.category || 'todas',
        pageSize: config.pageSize,
        totalReported,
        categoriesUsed: usedCategories.size,
        ambiguousProducts: pending.size,
        categoryProbes: probeCounts.size,
        withoutCategory: products.filter((p) => !p.store_category_external_id).length,
      },
    };
  },
};
