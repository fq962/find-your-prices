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
 * Estrategia de scraping para Walmart Honduras (https://www.walmart.com.hn).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * El sitio corre sobre VTEX (el html de una categoria trae `__STATE__`,
 * `__RUNTIME__` y 8000+ menciones de `vtex`). VTEX publica su catalogo por la
 * "Catalog System API" sin autenticacion, mas rica que la tarjeta visual:
 * codigo de barras EAN, precio de lista, stock, ficha tecnica completa,
 * galeria y la jerarquia de categorias con ids.
 *
 * Endpoint usado:
 *   GET {apiBaseUrl}/products/search/{rutaDeCategoria}?_from=N&_to=M&O=OrderByNameASC
 *
 * ---------------------------------------------------------------------------
 * Notas de campo verificadas contra el sitio (2026-09-09)
 * ---------------------------------------------------------------------------
 *
 *   - **Solo `products/search` acepta nuestro user agent.** Verificado con
 *     peticiones espaciadas: `category/tree`, `facets/search` y la API de
 *     intelligent-search responden 429 con `rate-limit-reason: bot` al bot
 *     honesto y 200 a un navegador. `products/search` responde 206 al bot sin
 *     problema. Por eso esta estrategia NO usa el arbol de categorias: la
 *     jerarquia se arma con lo que trae cada producto (`categoriesIds` +
 *     `categories`) y los hijos de una categoria salen del sitemap, que
 *     tambien acepta al bot. **No cambies el user agent para abrir esas
 *     puertas**: el sitio esta diciendo explicitamente que no quiere robots
 *     ahi, y lo que necesitamos se consigue sin eso.
 *
 *   - **La paginacion tiene dos topes distintos.** El tamaño de ventana es de
 *     50 articulos (`_to - _from <= 49`; con 51 responde 400 "Parameter _to
 *     can't be greater than 50", un mensaje que despista porque el limite real
 *     es el ancho, no el valor). Y hay un tope duro de desplazamiento:
 *     `_from` no puede pasar de 2500 (400 "Parameter _from can't be greater
 *     than 2500"). Es decir: **una consulta entrega como maximo 2550
 *     articulos**, sin importar cuantos declare tener.
 *
 *   - De ahi el barrido por subcategorias. Abarrotes (2469) e Higiene y
 *     Belleza (2410) caben en una sola consulta; Articulos para el hogar
 *     declara 4430 y no. Cuando un barrido toca el tope, se reparte entre las
 *     subcategorias hijas que publica el sitemap. Se verifico que la reparticion
 *     es exacta: la suma de las 14 hijas de Articulos para el hogar da 4430,
 *     el mismo total del padre, o sea que no hay articulos colgados solo del
 *     departamento. Aun asi, si una hoja sin hijos sigue topada se devuelve un
 *     error no fatal, para que el runner no de de baja lo que no llegamos a ver.
 *
 *   - **Se pide orden explicito (`O=OrderByNameASC`).** Sin el, VTEX ordena
 *     por relevancia, que puede reordenarse entre peticiones y hacer que un
 *     articulo se cuele entre dos paginas. Verificado que con orden por nombre
 *     tres paginas seguidas dan 150 ids unicos y que repetir la primera pagina
 *     devuelve exactamente la misma lista.
 *
 *   - **La url publica NO se reconstruye**: viene en `link`. Se verifico contra
 *     los 10 enlaces reales del html de /abarrotes, 10/10 identicos, y que
 *     siempre equivale a `{webBaseUrl}/{linkText}/p`.
 *
 *   - **`PriceValidUntil` se descarta a proposito.** Es siempre "hoy + un año",
 *     asi que cambia todos los dias sin que cambie nada real del producto. Como
 *     el runner mete todos los campos menos `raw` en el hash de contenido,
 *     guardarlo haria que el catalogo entero apareciera "actualizado" cada dia
 *     y llenaria price_history de ruido.
 *
 *   - `PriceToken` (un JWT con `iat`/`exp`) se recorta antes de guardar `raw`:
 *     cambia en cada peticion, no aporta nada y pesa.
 *
 *   - `ListPrice` repite a `Price` cuando no hay rebaja (solo 16 de 150
 *     articulos muestreados tenian descuento real), asi que `list_price` se
 *     llena unicamente si es estrictamente mayor.
 *
 *   - EAN al 100% en la muestra (150/150): `items[].ean`, y ademas
 *     `productReference` lo repite con prefijo "GTIN-".
 *
 *   - La ficha tecnica no viene en un array: cada especificacion es una clave
 *     de primer nivel del producto con valor `string[]`, y `allSpecifications`
 *     lista sus nombres. `_allowlist` y `ACL´s` son control de acceso interno
 *     de VTEX, no ficha tecnica: se excluyen.
 *
 *   - **`AvailableQuantity` NO es stock y por eso no se mapea.** En 1980
 *     articulos muestreados toma solo 5 valores: 100 (57%), 10 (26%), 99999
 *     (10%), 1 (4%) y 0 (3%). Son los topes de la simulacion del canal de
 *     venta, no un conteo; 99999 es el centinela de "sin limite". Guardarlo
 *     como `stock_quantity` seria afirmar que hay 99999 unidades, que es
 *     falso, y ademas era la unica fuente de ruido entre corridas: medido
 *     sobre Abarrotes con 10 minutos de diferencia, 23 de 2469 articulos
 *     cambiaban, los 23 por saltar de 100 a 99999 sin que se moviera nada
 *     real. La disponibilidad se toma de `IsAvailable`, que si es fiable, y
 *     el numero crudo queda en `raw` y en `attributes` por si sirve despues.
 *
 *   - **El total que declara la tienda cuenta filas, no articulos distintos.**
 *     Limpieza declara 1165 y la paginacion entrega 1165 filas, pero el
 *     productId 7767 viene dos veces: son 1164 productos. Por eso el barrido
 *     deduplica por `external_id` y por eso no se usa el total declarado como
 *     condicion de corte. Sin la deduplicacion, `ingest_store_products` se
 *     rompe: Postgres no deja que un mismo `on conflict do update` toque la
 *     misma fila dos veces.
 *
 *   - Ningun producto de la muestra tenia mas de un `item` (VTEX llama asi a
 *     los SKU) ni mas de un vendedor. Se mapean igual las variantes cuando hay
 *     mas de un item, pero sin inventar campos que no se pudieron verificar.
 *
 *   - El limite de peticiones que anuncia el 429 (`rate-limit-threshold: 45`)
 *     no se aplico a `products/search`: 40 peticiones seguidas sin pausa
 *     (1.25 req/s) pasaron sin un solo 429. Igual la tienda se rastrea con la
 *     pausa de cortesia configurada en `stores.request_delay_ms`.
 *
 *   - robots.txt permite estas rutas (solo prohibe /account/, /login/,
 *     /checkout/, /quick-view/, /espiar/ y /404).
 */

// -----------------------------------------------------------------------------
// Respuesta de la Catalog System API (interfaces locales, solo lo que se usa)
// -----------------------------------------------------------------------------

interface VtexCommertialOffer {
  Price?: number;
  ListPrice?: number;
  PriceWithoutDiscount?: number;
  FullSellingPrice?: number;
  AvailableQuantity?: number;
  IsAvailable?: boolean;
  Tax?: number;
  RewardValue?: number;
  /** JWT que cambia en cada peticion; se descarta antes de guardar `raw`. */
  PriceToken?: string;
  /** "hoy + un año": se descarta, ver cabecera. */
  PriceValidUntil?: string;
  [key: string]: unknown;
}

interface VtexSeller {
  sellerId?: string;
  sellerName?: string;
  sellerDefault?: boolean;
  commertialOffer?: VtexCommertialOffer;
}

interface VtexImage {
  imageId?: string;
  imageLabel?: string | null;
  imageUrl?: string;
  imageText?: string | null;
}

interface VtexItem {
  itemId?: string;
  name?: string;
  nameComplete?: string;
  ean?: string | null;
  measurementUnit?: string | null;
  unitMultiplier?: number | null;
  images?: VtexImage[];
  sellers?: VtexSeller[];
}

interface VtexProduct {
  productId?: string;
  productName?: string;
  productTitle?: string | null;
  brand?: string | null;
  brandId?: number | null;
  linkText?: string;
  link?: string;
  productReference?: string | null;
  categoryId?: string | null;
  metaTagDescription?: string | null;
  description?: string | null;
  releaseDate?: string | null;
  /** Rutas legibles, hoja -> raiz: ["/Abarrotes/Aceites de cocina/Aceite de Oliva/", ...] */
  categories?: string[];
  /** Las mismas rutas en ids: ["/1/29/207/", "/1/29/", "/1/"] */
  categoriesIds?: string[];
  productClusters?: Record<string, string>;
  allSpecifications?: string[];
  items?: VtexItem[];
  /** Cada especificacion es una clave de primer nivel con valor string[]. */
  [key: string]: unknown;
}

// -----------------------------------------------------------------------------
// Valores por defecto y limites de la API
// -----------------------------------------------------------------------------

const DEFAULTS = {
  apiBaseUrl: 'https://www.walmart.com.hn/api/catalog_system/pub',
  webBaseUrl: 'https://www.walmart.com.hn',
  pageSize: 50,
  orderBy: 'OrderByNameASC',
} as const;

/** Ancho maximo de ventana: `_to - _from <= 49`. */
const MAX_PAGE_SIZE = 50;

/** Desplazamiento maximo: `_from` mayor a esto responde 400. */
const MAX_OFFSET = 2500;

/** Techo real de una consulta: 2500 + 50. Ver cabecera. */
const MAX_ITEMS_PER_QUERY = MAX_OFFSET + MAX_PAGE_SIZE;

/** Tope de peticiones por corrida, para que un cambio en la API no sea un bucle. */
const MAX_PAGES_HARD_LIMIT = 400;

/** Cuantos niveles se puede bajar buscando subcategorias que quepan bajo el tope. */
const MAX_PARTITION_DEPTH = 3;

/** Ventanas seguidas fallidas antes de dar la rama por perdida. Ver `sweep`. */
const MAX_CONSECUTIVE_PAGE_FAILURES = 3;

/** Especificaciones que son control de acceso interno de VTEX, no ficha tecnica. */
const INTERNAL_SPEC_KEYS = new Set(['_allowlist', 'ACL´s', "ACL's", 'allSpecifications', 'allSpecificationsGroups']);

interface WalmartHnConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  pageSize: number;
  orderBy: string;
  /** Ruta de categoria del sitio, sin barras: 'abarrotes', 'higiene-y-belleza'. */
  categoryPath: string | null;
  syncCategories: boolean;
  partitionOversized: boolean;
}

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para poder probarlas sin red)
// -----------------------------------------------------------------------------

export function round2(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Saca la ruta de categoria de la url publica del target.
 *
 * 'https://www.walmart.com.hn/abarrotes' -> 'abarrotes'
 * 'https://www.walmart.com.hn/articulos-para-el-hogar/ferreteria/' -> 'articulos-para-el-hogar/ferreteria'
 */
export function categoryPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '').trim();
  return clean.length > 0 ? clean : null;
}

/**
 * `productReference` viene como "GTIN-8410179000053". El EAN del item ya trae
 * el numero limpio, asi que esto solo sirve de respaldo cuando el item no lo
 * publica.
 */
export function stripGtinPrefix(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const value = reference.replace(/^GTIN-/i, '').trim();
  return value.length > 0 ? value : null;
}

/**
 * Arma la ficha tecnica leyendo las claves que `allSpecifications` nombra.
 *
 * VTEX no las agrupa en un array: cada especificacion es una clave de primer
 * nivel del producto cuyo valor es `string[]`.
 */
export function extractSpecifications(product: VtexProduct): Record<string, string[]> {
  const specs: Record<string, string[]> = {};
  for (const key of product.allSpecifications ?? []) {
    if (INTERNAL_SPEC_KEYS.has(key)) continue;
    const value = product[key];
    if (!Array.isArray(value)) continue;
    const values = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (values.length > 0) specs[key] = values;
  }
  return specs;
}

/** Primer valor de una especificacion, buscada sin depender de tildes ni mayusculas. */
export function specValue(specs: Record<string, string[]>, candidates: string[]): string | null {
  const normalize = (input: string) =>
    input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const wanted = candidates.map(normalize);
  for (const [key, values] of Object.entries(specs)) {
    if (wanted.includes(normalize(key))) return values[0] ?? null;
  }
  return null;
}

/** La ruta mas especifica es la PRIMERA (VTEX las entrega hoja -> raiz). */
function splitCategoryPath(path: string | undefined): string[] {
  return (path ?? '').split('/').filter((part) => part.length > 0);
}

function toAvailability(offer: VtexCommertialOffer | undefined): AvailabilityStatus {
  if (!offer) return 'unknown';
  if (offer.IsAvailable) return 'in_stock';
  return 'out_of_stock';
}

function mapImages(item: VtexItem | undefined, productName: string): NormalizedImage[] {
  return (item?.images ?? [])
    .filter((img): img is VtexImage & { imageUrl: string } => typeof img.imageUrl === 'string' && img.imageUrl.length > 0)
    .map((img, index) => ({
      url: img.imageUrl,
      external_id: img.imageId ?? null,
      position: index,
      is_primary: index === 0,
      // `imageText`/`imageLabel` traen el nombre del archivo ("13900_01.jpg"),
      // que como texto alternativo no dice nada: se usa el nombre del producto.
      alt_text: productName,
    }));
}

/** El vendedor por defecto es el que decide el precio que ve el cliente. */
function defaultSeller(item: VtexItem | undefined): VtexSeller | undefined {
  const sellers = item?.sellers ?? [];
  return sellers.find((s) => s.sellerDefault) ?? sellers[0];
}

/** `raw` sin el JWT de precio, que cambia en cada peticion y no aporta nada. */
function trimOffer(offer: VtexCommertialOffer | undefined): Record<string, unknown> | null {
  if (!offer) return null;
  const rest: Record<string, unknown> = { ...offer };
  delete rest.PriceToken;
  delete rest.PaymentOptions;
  return rest;
}

/** Traduce un producto de la Catalog System API al contrato comun del sistema. */
export function mapWalmartHnProduct(product: VtexProduct, currency: string): NormalizedProduct | null {
  const externalId = product?.productId;
  const name = product?.productName?.trim();
  const url = product?.link;
  if (!externalId || !name || !url) return null;

  const items = product.items ?? [];
  const mainItem = items[0];
  const seller = defaultSeller(mainItem);
  const offer = seller?.commertialOffer;

  const price = round2(offer?.Price);
  const listRaw = round2(offer?.ListPrice);
  // "ListPrice" repite a "Price" cuando no hay rebaja de verdad: solo cuenta
  // como precio de lista si es estrictamente mayor.
  const listPrice = listRaw !== null && price !== null && listRaw > price + 0.001 ? listRaw : null;

  const specs = extractSpecifications(product);
  const categoryIdPath = splitCategoryPath(product.categoriesIds?.[0]);
  const categoryNamePath = splitCategoryPath(product.categories?.[0]);
  const availability = toAvailability(offer);

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (availability === 'out_of_stock') badges.push('agotado');

  const barcode = (mainItem?.ean ?? '').trim() || stripGtinPrefix(product.productReference);

  return {
    // Identidad
    external_id: String(externalId),
    name,
    url,
    slug: product.linkText ?? null,
    sku: mainItem?.itemId ?? null,
    external_code: stripGtinPrefix(product.productReference),
    barcode_raw: barcode,
    ean: barcode,
    seller_id: seller?.sellerId ?? null,
    seller_name: seller?.sellerName ?? null,

    // Contenido
    name_alias: product.items?.[0]?.nameComplete ?? null,
    description: product.description?.trim() || null,
    short_description: product.metaTagDescription?.trim() || null,
    brand_raw: product.brand?.trim() || null,
    manufacturer: specValue(specs, ['Fabricante', 'Manufacturer']),
    color: specValue(specs, ['Color']),
    size: specValue(specs, ['Tamaño (Gramaje, Volumen)', 'Tamaño', 'Talla']),
    material: specValue(specs, ['Material']),
    condition: 'new',

    // Clasificacion. El runner traduce el codigo de la tienda a su id interno.
    store_category_external_id: product.categoryId ? String(product.categoryId) : (categoryIdPath.at(-1) ?? null),
    category_raw: categoryNamePath.at(-1) ?? null,
    category_path: categoryNamePath,
    // `productClusters` (las colecciones de marketing: "Hot Sale Alimentos WM
    // S3", "CyberWeeks Ver Todo"...) se deja fuera de `tags` a proposito. Un
    // articulo cualquiera pertenece a 26 y rotan con cada campaña; como el
    // runner mete todos los campos menos `raw` en el hash, guardarlas haria que
    // media tienda apareciera "actualizada" cada vez que cambia una promocion,
    // sin que cambie ni el precio ni la ficha. Quedan en `raw`.

    // Precio
    currency,
    price,
    list_price: listPrice,
    discount_percent: listPrice !== null && price !== null ? round2(((listPrice - price) / listPrice) * 100) : null,
    discount_amount: listPrice !== null && price !== null ? round2(listPrice - price) : null,
    unit_measure_code: mainItem?.measurementUnit ?? null,
    unit_amount: mainItem?.unitMultiplier ?? null,
    tax_rate: round2(offer?.Tax),
    tax_included: true,
    // `PriceValidUntil` se omite a proposito: es "hoy + un año" y ensuciaria el
    // hash de contenido todos los dias. Ver cabecera.

    // Disponibilidad
    availability,
    in_stock: offer?.IsAvailable ?? null,
    // `stock_quantity` queda en null a proposito: `AvailableQuantity` es un
    // tope de simulacion, no inventario. Ver cabecera.
    stock_quantity: null,

    // Medios
    primary_image_url: mainItem?.images?.[0]?.imageUrl ?? null,
    images: mapImages(mainItem, name),

    // VTEX llama "items" a los SKU. En la muestra ninguno tenia mas de uno,
    // pero si aparecen se mapean; los demas quedan como variantes.
    variants: items.slice(1).map((item) => {
      const variantOffer = defaultSeller(item)?.commertialOffer;
      const variantPrice = round2(variantOffer?.Price);
      const variantList = round2(variantOffer?.ListPrice);
      return {
        external_id: String(item.itemId ?? ''),
        sku: item.itemId ?? null,
        barcode_raw: (item.ean ?? '').trim() || null,
        name: item.nameComplete ?? item.name ?? null,
        currency,
        price: variantPrice,
        list_price:
          variantList !== null && variantPrice !== null && variantList > variantPrice + 0.001 ? variantList : null,
        availability: toAvailability(variantOffer),
        in_stock: variantOffer?.IsAvailable ?? null,
        stock_quantity: null,
        image_url: item.images?.[0]?.imageUrl ?? null,
      };
    }),

    // Datos libres
    specs,
    attributes: {
      brandId: product.brandId ?? null,
      releaseDate: product.releaseDate ?? null,
      categoriesIds: product.categoriesIds ?? [],
      // Se guarda el numero crudo por referencia, sabiendo que es un tope de
      // simulacion y no inventario (ver cabecera). No va en `stock_quantity`.
      availableQuantityRaw: offer?.AvailableQuantity ?? null,
    },
    badges,
    meta_title: product.productTitle?.trim() || null,
    meta_description: product.metaTagDescription?.trim() || null,

    raw: {
      productId: externalId,
      productName: name,
      brand: product.brand,
      linkText: product.linkText,
      link: product.link,
      productReference: product.productReference,
      categoryId: product.categoryId,
      categories: product.categories,
      categoriesIds: product.categoriesIds,
      productClusters: product.productClusters ?? {},
      description: product.description,
      specifications: specs,
      items: items.map((item) => ({
        itemId: item.itemId,
        nameComplete: item.nameComplete,
        ean: item.ean,
        measurementUnit: item.measurementUnit,
        unitMultiplier: item.unitMultiplier,
        images: (item.images ?? []).map((img) => ({ imageId: img.imageId, imageUrl: img.imageUrl })),
        offer: trimOffer(defaultSeller(item)?.commertialOffer),
      })),
    },
  };
}

/**
 * Arma el arbol de categorias con lo que trae cada producto.
 *
 * No hay peticion extra: `categoriesIds` ("/1/29/207/") y `categories`
 * ("/Abarrotes/Aceites de cocina/Aceite de Oliva/") vienen emparejadas y
 * ordenadas raiz -> hoja dentro de la ruta mas especifica.
 */
export function collectCategories(product: VtexProduct, into: Map<string, NormalizedCategory>): void {
  const ids = splitCategoryPath(product.categoriesIds?.[0]);
  const names = splitCategoryPath(product.categories?.[0]);
  if (ids.length === 0 || ids.length !== names.length) return;

  let parentId: string | null = null;
  for (let level = 0; level < ids.length; level += 1) {
    const externalId = ids[level];
    if (!into.has(externalId)) {
      into.set(externalId, {
        external_id: externalId,
        name: names[level],
        external_parent_id: parentId,
        level: level + 1,
      });
    }
    parentId = externalId;
  }
}

/**
 * Rutas de categoria que publica el sitemap.
 *
 * Es la unica fuente de la jerarquia que acepta a nuestro bot: el endpoint
 * `category/tree` responde 429 con `rate-limit-reason: bot`. Ver cabecera.
 */
export function parseCategorySitemap(xml: string, webBaseUrl: string): string[] {
  const host = webBaseUrl.replace(/\/+$/, '');
  const paths: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const loc = match[1];
    if (!loc.startsWith(host)) continue;
    const path = categoryPathFromUrl(loc);
    if (path) paths.push(path);
  }
  return [...new Set(paths)];
}

/** Hijas directas de una ruta: un segmento mas, mismo prefijo. */
export function directChildren(allPaths: string[], parent: string): string[] {
  const prefix = `${parent}/`;
  const depth = parent.split('/').length + 1;
  return allPaths.filter((path) => path.startsWith(prefix) && path.split('/').length === depth);
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>, targetUrl: string | null): WalmartHnConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };
  const pageSize = Number(raw.pageSize);
  const configuredPath = typeof raw.categoryPath === 'string' ? categoryPathFromUrl(raw.categoryPath) : null;

  return {
    apiBaseUrl: str('apiBaseUrl', DEFAULTS.apiBaseUrl).replace(/\/+$/, ''),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    pageSize:
      Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    orderBy: str('orderBy', DEFAULTS.orderBy),
    categoryPath: configuredPath ?? categoryPathFromUrl(targetUrl),
    syncCategories: raw.syncCategories !== false,
    partitionOversized: raw.partitionOversized !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const walmarthnStrategy: ScrapeStrategy = {
  key: 'walmarthn',
  label: 'Walmart Honduras (VTEX Catalog API)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categoryPath',
      label: 'Ruta de categoria',
      example: 'abarrotes',
      description:
        'Ruta del sitio sin barras ("abarrotes", "articulos-para-el-hogar/ferreteria"). Si se omite, se toma de la url del target.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '50',
      description: 'Maximo aceptado por la API: 50 (el ancho de la ventana _from/_to).',
    },
    {
      key: 'orderBy',
      label: 'Orden',
      example: 'OrderByNameASC',
      description:
        'Orden explicito para que la paginacion sea estable. Sin el, VTEX ordena por relevancia y un articulo puede colarse entre dos paginas.',
    },
    {
      key: 'partitionOversized',
      label: 'Repartir categorias grandes',
      example: 'true',
      description:
        'Cuando una categoria supera los 2550 articulos que entrega la API, baja a sus subcategorias (tomadas del sitemap) para cubrirla completa.',
    },
    {
      key: 'syncCategories',
      label: 'Sincronizar categorias',
      example: 'true',
      description: 'Arma el arbol de categorias con lo que trae cada producto, sin peticion extra.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config, ctx.target.url);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];

    const products: NormalizedProduct[] = [];
    const categoryMap = new Map<string, NormalizedCategory>();
    const seen = new Set<string>();
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let pagesFetched = 0;
    let sitemapPaths: string[] | null = null;

    /** El sitemap se descarga una sola vez por corrida, y solo si hace falta. */
    async function loadSitemapPaths(): Promise<string[]> {
      if (sitemapPaths) return sitemapPaths;
      const xml = await ctx.http.getText(`${config.webBaseUrl}/sitemap/category-0.xml`);
      sitemapPaths = parseCategorySitemap(xml, config.webBaseUrl);
      return sitemapPaths;
    }

    /** Rutas raiz del sitio, para el target de catalogo completo. */
    async function rootPaths(): Promise<string[]> {
      const paths = await loadSitemapPaths();
      return paths.filter((path) => !path.includes('/'));
    }

    /**
     * Barre una ruta de categoria hasta agotarla o hasta topar con el limite de
     * la API. Devuelve si quedo truncada, para decidir si hay que repartirla.
     */
    async function sweep(path: string): Promise<{ truncated: boolean; found: number }> {
      let from = 0;
      let found = 0;
      let consecutiveFailures = 0;
      let hadFailures = false;

      while (from <= MAX_OFFSET && pagesFetched < maxPages) {
        if (ctx.signal.aborted) {
          errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo', meta: { path, from } });
          return { truncated: true, found };
        }

        const to = Math.min(from + config.pageSize - 1, MAX_OFFSET + MAX_PAGE_SIZE - 1);
        const url =
          `${config.apiBaseUrl}/products/search/${path}` +
          `?_from=${from}&_to=${to}&O=${encodeURIComponent(config.orderBy)}`;

        let batch: VtexProduct[];
        try {
          batch = await ctx.http.getJson<VtexProduct[]>(url);
          consecutiveFailures = 0;
        } catch (error) {
          // La tienda devuelve algun 500 suelto cuando se la rastrea sostenido
          // (verificado: la misma ventana responde 206 al reintentarla a mano
          // un minuto despues). Perder una ventana no justifica abandonar la
          // rama entera, asi que se salta y se sigue; solo se corta si fallan
          // varias seguidas, que ya no parece un tropiezo. En cualquiera de los
          // dos casos el barrido queda marcado como incompleto: el error no
          // vacio hace que el runner se salte el delisting.
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: 'paginate', message, meta: { path, from } });
          ctx.log('warn', `Fallo la ventana ${from} de ${path}: ${message}`);

          pagesFetched += 1;
          hadFailures = true;
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_PAGE_FAILURES) {
            ctx.log('error', `Se abandona "${path}" tras ${consecutiveFailures} ventanas seguidas fallidas`);
            return { truncated: true, found };
          }
          from += config.pageSize;
          continue;
        }

        pagesFetched += 1;
        if (!Array.isArray(batch) || batch.length === 0) return { truncated: hadFailures, found };

        for (const item of batch) {
          const mapped = mapWalmartHnProduct(item, currency);
          if (!mapped) continue;
          if (config.syncCategories) collectCategories(item, categoryMap);
          // Un articulo aparece en varias categorias y puede repetirse entre
          // paginas: se queda el primero. Ademas `ingest_store_products` falla
          // si un mismo comando toca dos veces la misma fila.
          if (!seen.has(mapped.external_id)) {
            seen.add(mapped.external_id);
            products.push(mapped);
          }
          found += 1;
        }

        // Pagina corta: se acabo la categoria.
        if (batch.length < config.pageSize) return { truncated: hadFailures, found };
        from += config.pageSize;
      }

      // Se salio sin pagina corta: o por el tope de desplazamiento de la API, o
      // porque se acabo el presupuesto de paginas. En los dos casos quedaron
      // articulos sin ver por esta ruta.
      if (pagesFetched >= maxPages) {
        errors.push({
          stage: 'paginate',
          message: `Se alcanzo el tope de ${maxPages} paginas barriendo "${path}"`,
          meta: { path, from },
        });
      }
      return { truncated: true, found };
    }

    const startPaths = ctx.target.kind === 'full_catalog' ? await rootPaths() : [config.categoryPath];
    if (startPaths.length === 0 || startPaths[0] === null) {
      throw new Error(
        'No se pudo determinar la ruta de categoria: falta config.categoryPath y el target no tiene url.',
      );
    }

    // Cola de rutas por barrer. Crece cuando una categoria no cabe en el tope
    // de la API y hay que repartirla entre sus hijas.
    const queue: Array<{ path: string; depth: number }> = (startPaths as string[]).map((path) => ({
      path,
      depth: 0,
    }));
    const swept = new Set<string>();
    const partitioned: string[] = [];

    while (queue.length > 0 && pagesFetched < maxPages) {
      const { path, depth } = queue.shift()!;
      if (swept.has(path)) continue;
      swept.add(path);

      const { truncated } = await sweep(path);
      if (!truncated || !config.partitionOversized) continue;

      if (depth >= MAX_PARTITION_DEPTH) {
        errors.push({
          stage: 'partition',
          message: `La categoria "${path}" sigue superando el limite de la API tras ${depth} niveles`,
          meta: { path, limit: MAX_ITEMS_PER_QUERY },
        });
        continue;
      }

      let children: string[] = [];
      try {
        children = directChildren(await loadSitemapPaths(), path);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'sitemap', message, meta: { path } });
        ctx.log('error', `No se pudo leer el sitemap de categorias: ${message}`);
        continue;
      }

      if (children.length === 0) {
        // Sin hijas no hay como cubrir el resto: se avisa para que el runner no
        // de de baja articulos que simplemente no llegamos a ver.
        errors.push({
          stage: 'partition',
          message: `La categoria "${path}" supera los ${MAX_ITEMS_PER_QUERY} articulos que entrega la API y no tiene subcategorias`,
          meta: { path },
        });
        continue;
      }

      partitioned.push(path);
      ctx.log('info', `"${path}" supera el tope de la API: se reparte en ${children.length} subcategorias`, {
        path,
        children,
      });
      for (const child of children) queue.push({ path: child, depth: depth + 1 });
    }

    if (queue.length > 0) {
      errors.push({
        stage: 'paginate',
        message: `Se alcanzo el tope de ${maxPages} paginas con ${queue.length} categorias sin barrer`,
        meta: { pending: queue.map((entry) => entry.path) },
      });
    }

    return {
      products,
      categories: categoryMap.size > 0 ? [...categoryMap.values()] : undefined,
      pagesFetched,
      errors,
      stats: {
        categoryPath: config.categoryPath,
        pathsSwept: [...swept],
        partitioned,
        pageSize: config.pageSize,
        orderBy: config.orderBy,
      },
    };
  },
};
