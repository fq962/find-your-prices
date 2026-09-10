import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedProduct,
  NormalizedVariant,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';

/**
 * Estrategia de scraping para PriceSmart Honduras (https://www.pricesmart.com/es-hn).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * El sitio es un Nuxt con Vue Storefront 2 (`<meta name="generator"
 * content="Vue Storefront 2">`, payload `__NUXT__`). El html que devuelve el
 * servidor para una categoria pesa 384 KB y trae **cero** productos: ni un
 * `/es-hn/producto/`, ni un precio. Las tarjetas las pinta el navegador contra
 * una API.
 *
 * Esa API es Bloomreach Discovery, expuesta por el propio sitio como proxy
 * (asi no hay que ir a `core.dxpapi.com` ni manejar credenciales aparte):
 *
 *   POST https://www.pricesmart.com/api/br_discovery/getProductsByKeyword
 *   body: [ { q, search_type: 'category', start, rows, fl, view_id, ... } ]
 *
 * El body es un **array de un objeto**: es la convencion del middleware de Vue
 * Storefront (los argumentos del metodo van posicionalmente). Mandar el objeto
 * suelto no funciona.
 *
 * ---------------------------------------------------------------------------
 * Notas de campo verificadas contra el sitio (2026-09-10)
 * ---------------------------------------------------------------------------
 *
 *   - **`rows` tope 200.** Con 250, 300, 400, 500 o 1000 el proxy responde 400
 *     (un AxiosError del middleware, sin mensaje util). Con 200 responde 200.
 *
 *   - **`start` no tiene tope practico.** A diferencia de Walmart HN, pedir
 *     `start=1000` sobre una categoria de 1117 devuelve los 117 que faltan. No
 *     hace falta repartir por subcategorias.
 *
 *   - **Consultar una categoria raiz incluye a todos sus descendientes.**
 *     Verificado: los 29 articulos de "Papas fritas" (G10D02019001), los 63 de
 *     "Panaderia" (Fresh_Bakery) y los 110 de "Carnes" (G10D59015) estan los
 *     202 dentro de los 1117 de "Alimentos" (G10D03). Por eso barrer las 25
 *     categorias de nivel 1 cubre el catalogo entero: 2777 articulos en ~40
 *     peticiones. Es un club de membresia, no un hipermercado.
 *
 *   - **`url` de la API apunta a Costa Rica y hay que ignorarlo.** Devuelve
 *     `https://www.pricesmart.com/site/cr/es/pagina-producto/50630` para todos
 *     los articulos, sea cual sea el `view_id`. La url publica de Honduras se
 *     arma con `slug` + `master_sku` (ver `buildPriceSmartUrl`), verificado al
 *     100% contra el sitemap: 707 de 707 coincidencias exactas, 0 diferencias.
 *     Los 410 restantes del barrido no estan en el sitemap todavia (articulos
 *     nuevos); tres de ellos, comprobados a mano, responden 200.
 *
 *   - **`price` y `sale_price` son siempre 0.** El precio real es `price_HN`,
 *     y viene en **centavos** (21995 = L 219.95) con `fractionDigits: 2`. El
 *     sufijo `_HN` sale de `view_id`, que es lo que separa el catalogo de cada
 *     pais dentro de la misma cuenta de Bloomreach.
 *
 *   - **`availability_HN` es siempre "true" y no sirve de nada.** La señal real
 *     de existencias es `inventory_HN`: "in stock" / "out of stock" (990/127 en
 *     Alimentos).
 *
 *   - **El descuento viene en dos campos y solo en el 1% del catalogo.**
 *     `original_price_without_saving_HN` ("279.95", en unidades, no centavos) y
 *     `saving_amount_HN` ("-60.0", negativo). Cuadran exactamente con
 *     `price_HN`. Cuando no hay rebaja, los campos no vienen: no hay que
 *     descartar precios "antes" iguales al actual como en otras tiendas.
 *
 *   - **El arbol de categorias sale gratis en la misma peticion.**
 *     `facet_counts.facet_fields.category` trae cada categoria con `cat_id`,
 *     `cat_name`, `parent` y `tree_path`. Cero peticiones extra, y con nombres
 *     acentuados de verdad (el sitemap los trae sin tildes).
 *
 *   - **La respuesta es determinista.** Dos llamadas identicas separadas por
 *     1.5 s devolvieron los 200 documentos en el mismo orden y byte a byte
 *     iguales. Nada volatil se cuela en el hash de contenido.
 *
 *   - **El bot honesto es bienvenido.** `robots.txt` bloquea a ClaudeBot,
 *     GPTBot y CCBot, pero para `User-agent: *` solo cierra carrito, cuenta,
 *     pdf y **urls con `fq=`** (facetas). Nuestro user agent recibe 200 tanto
 *     en el proxy como en el sitemap. Esta estrategia manda siempre `fq: []`,
 *     asi que tampoco pisa lo que el sitio pide no rastrear.
 *
 *   - **`_br_uid_2` y `request_id` no se mandan.** Son la cookie de
 *     seguimiento del visitante y un correlativo de la sesion del navegador.
 *     La API responde igual sin ellos, y mandarlos seria fabricar telemetria
 *     falsa dentro de la analitica de la tienda.
 */

// -----------------------------------------------------------------------------
// 1. Forma de la respuesta de Bloomreach Discovery
// -----------------------------------------------------------------------------

interface BrVariant {
  skuid?: string | null;
}

interface BrDoc {
  pid?: string | null;
  title?: string | null;
  brand?: string | null;
  slug?: string | null;
  master_sku?: string | null;
  description?: string | null;
  thumb_image?: string | null;
  currency?: string | null;
  fractionDigits?: number | null;
  /** Precio vigente en centavos. El `price` sin sufijo siempre viene en 0. */
  price_HN?: number | null;
  /** "in stock" | "out of stock". */
  inventory_HN?: string | null;
  /** Siempre "true": no distingue nada, no se usa. */
  availability_HN?: string | null;
  /** Precio antes de la rebaja, en unidades ("279.95"). Solo si hay rebaja. */
  original_price_without_saving_HN?: string | number | null;
  /** Ahorro, negativo ("-60.0"). Solo si hay rebaja. */
  saving_amount_HN?: string | number | null;
  /** Etiquetas de campaña: "free-delivery", "new arrival", "manufacturer savings"... */
  promoid_HN?: string[] | null;
  /** Articulos vendidos por peso (carniceria, panaderia). */
  sold_by_weight_HN?: string | boolean | null;
  weight_HN?: string | number | null;
  weight_uom_description_HN?: string | null;
  price_per_uom_HN?: string | number | null;
  uom_description_HN?: string | null;
  sign_price_HN?: string | number | null;
  variants?: BrVariant[] | null;
  [key: string]: unknown;
}

/** Una entrada del facet de categorias: el arbol completo, gratis. */
interface BrCategoryFacet {
  cat_id?: string | null;
  cat_name?: string | null;
  parent?: string | null;
  /** "/P10D51/P10D51004" */
  crumb?: string | null;
  /** "/P10D51,Mascotas/P10D51004,Alimento y golosinas para perros" */
  tree_path?: string | null;
  count?: number | null;
}

interface BrResponse {
  response?: {
    numFound?: number;
    start?: number;
    docs?: BrDoc[];
  };
  facet_counts?: {
    facet_fields?: {
      category?: BrCategoryFacet[];
    };
  };
}

// -----------------------------------------------------------------------------
// 2. Valores por defecto
// -----------------------------------------------------------------------------

const DEFAULTS = {
  apiUrl: 'https://www.pricesmart.com/api/br_discovery/getProductsByKeyword',
  webBaseUrl: 'https://www.pricesmart.com',
  /** Prefijo de idioma/pais de las urls publicas. */
  localePath: 'es-hn',
  accountId: '7024',
  authKey: 'ev7libhybjg5h1d1',
  domainKey: 'pricesmart_bloomreach_io_es',
  /** Sufijo de los campos por pais y valor de `view_id`. */
  viewId: 'HN',
  pageSize: 200,
} as const;

/**
 * Tope REAL de `rows`. Verificado: 200 -> 200 OK; 250, 300, 400, 500 y 1000 ->
 * 400. No es un limite documentado, es el que impone el proxy.
 */
const MAX_PAGE_SIZE = 200;

/** Tope duro de peticiones por corrida, para que un cambio de API no sea un bucle. */
const MAX_PAGES_HARD_LIMIT = 120;

/**
 * Las 25 categorias de nivel 1 del catalogo hondureño, tomadas del sitemap el
 * 2026-09-10. Barrerlas todas equivale al catalogo completo porque consultar
 * una raiz incluye a sus descendientes (verificado, ver cabecera).
 *
 * Se pueden sobreescribir desde `stores.config.rootCategories` sin tocar codigo
 * cuando PriceSmart agregue o quite un departamento.
 */
const DEFAULT_ROOT_CATEGORIES = [
  'G10D03', // Alimentos
  'U11D13', // Audiologia
  'A10D20', // Automotriz
  'B10D27', // Bebe
  'C10D29', // Computadoras, tablets y accesorios
  'S30D26', // Deportes y fitness
  'S20D23', // Electrodomesticos
  'E10D24', // Electronicos
  'L10D22', // Equipaje
  'O20D30', // Exteriores
  'H10D21', // Ferreteria y mejoras al hogar
  'H30D22', // Hogar
  'J10D44', // Joyeria y relojes
  'T10D46', // Juguetes y juegos
  'G10D08014', // Licor, cerveza y vino
  'M10D43', // Linea blanca
  'P10D51', // Mascotas
  'F10D40', // Moda y accesorios
  'F20D27', // Muebles
  'O10D25', // Oficina
  'U10D72', // Optica
  'T20D42', // Peliculas, musica y libros
  'S10D45', // Productos de temporada
  'H20D09', // Salud y belleza
  'R10D22', // Suministros para restaurantes
] as const;

/**
 * Campos que se le piden a Bloomreach.
 *
 * Bloomreach solo devuelve lo que se le pide en `fl` y **descarta en silencio**
 * lo que no tiene indexado, asi que la lista se puede ampliar sin riesgo. Esta
 * sale de la que usa el propio sitio, mas `description` (100% de cobertura) que
 * el sitio no pide en la lista de categoria. Se probaron ademas ~30 nombres
 * candidatos (upc, ean, gtin, barcode, category, rating, size, color...) y
 * ninguno existe: en esta cuenta no estan indexados.
 */
const FIELD_LIST = [
  'pid',
  'title',
  'brand',
  'slug',
  'master_sku',
  'skuid',
  'description',
  'thumb_image',
  'currency',
  'fractionDigits',
  'price_HN',
  'inventory_HN',
  'availability_HN',
  'original_price_without_saving_HN',
  'saving_amount_HN',
  'promoid_HN',
  'sold_by_weight_HN',
  'weight_HN',
  'weight_uom_description_HN',
  'price_per_uom_HN',
  'uom_description_HN',
  'sign_price_HN',
].join(',');

interface PriceSmartConfig {
  apiUrl: string;
  webBaseUrl: string;
  localePath: string;
  accountId: string;
  authKey: string;
  domainKey: string;
  viewId: string;
  pageSize: number;
  /** Solo para targets de tipo categoria: el codigo a barrer (ej. "P10D51"). */
  categoryCode: string | null;
  /** Categorias raiz que barre un target de catalogo completo. */
  rootCategories: string[];
  syncCategories: boolean;
  fieldList: string;
}

// -----------------------------------------------------------------------------
// 3. Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

export function round2(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Numeros que la API manda a veces como texto ("279.95", "-60.0") y a veces
 * como numero. Cuidado con `Number('')`, que es 0 y no null.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Los precios por pais vienen en la unidad minima de la moneda: `price_HN`
 * 21995 con `fractionDigits: 2` son L 219.95. `fractionDigits` se respeta en
 * vez de dividir siempre entre 100 porque la misma cuenta sirve paises con
 * monedas de 0 decimales (COP) y el dia que HN cambie, esto no miente.
 */
export function minorToMajor(minor: unknown, fractionDigits: number | null | undefined): number | null {
  const value = toNumber(minor);
  if (value === null) return null;
  const digits = Number.isFinite(fractionDigits) ? Number(fractionDigits) : 2;
  if (digits <= 0) return round2(value);
  return round2(value / 10 ** digits);
}

/** "in stock" / "out of stock" es la unica señal util (availability_HN es siempre "true"). */
export function toAvailability(inventory: string | null | undefined): AvailabilityStatus {
  const normalized = (inventory ?? '').trim().toLowerCase();
  if (normalized === 'in stock' || normalized === 'in_stock') return 'in_stock';
  if (normalized === 'out of stock' || normalized === 'out_of_stock') return 'out_of_stock';
  return 'unknown';
}

/**
 * Url publica de Honduras.
 *
 * `url` de la API apunta al sitio de Costa Rica, asi que se arma a mano:
 *
 *   {web}/{locale}/producto/{slug}/{master_sku}
 *
 * El `slug` ya termina en el pid ("...-478169") y el `master_sku` es el pid a
 * secas o `pid-codigoDeBarras` en articulos con variantes. Verificado contra el
 * sitemap: 707/707 exactas.
 */
export function buildPriceSmartUrl(
  doc: Pick<BrDoc, 'slug' | 'master_sku' | 'pid'>,
  config: Pick<PriceSmartConfig, 'webBaseUrl' | 'localePath'>,
): string | null {
  const slug = doc.slug?.trim();
  const sku = (doc.master_sku ?? doc.pid ?? '').toString().trim();
  if (!slug || !sku) return null;
  const base = config.webBaseUrl.replace(/\/+$/, '');
  const locale = config.localePath.replace(/^\/+|\/+$/g, '');
  return `${base}/${locale}/producto/${slug}/${encodeURIComponent(sku)}`;
}

/**
 * Codigo de barras deducido de las variantes.
 *
 * PriceSmart no publica un campo de codigo de barras, pero cuando un articulo
 * tiene variantes sus `skuid` toman la forma `{pid}-{gtin}`:
 *
 *   pid 317825 -> 317825-8000500142943, 317825-8000500142967, ...
 *
 * Es poco frecuente (1 de 1117 en Alimentos) pero es lo unico que permite
 * cruzar este catalogo con el de otra tienda, asi que se guarda cuando esta.
 * Se toma el del `master_sku`, que es la variante que la ficha muestra por
 * defecto; si no lo trae, la primera variante con forma de GTIN.
 */
export function barcodeFromVariants(doc: Pick<BrDoc, 'pid' | 'master_sku' | 'variants'>): string | null {
  const pid = (doc.pid ?? '').toString().trim();
  if (!pid) return null;

  const extract = (skuid: unknown): string | null => {
    if (typeof skuid !== 'string') return null;
    const prefix = `${pid}-`;
    if (!skuid.startsWith(prefix)) return null;
    const rest = skuid.slice(prefix.length);
    return /^\d{8,14}$/.test(rest) ? rest : null;
  };

  const fromMaster = extract(doc.master_sku);
  if (fromMaster) return fromMaster;

  for (const variant of doc.variants ?? []) {
    const found = extract(variant?.skuid);
    if (found) return found;
  }
  return null;
}

/** Variantes tal como las publica la tienda: solo traen el skuid. */
function mapVariants(doc: BrDoc, price: number | null, currency: string): NormalizedVariant[] {
  const pid = (doc.pid ?? '').toString().trim();
  const variants = (doc.variants ?? [])
    .map((variant) => variant?.skuid)
    .filter((skuid): skuid is string => typeof skuid === 'string' && skuid.trim().length > 0);

  // Una sola variante que es el propio articulo no aporta nada: se omite.
  if (variants.length <= 1) return [];

  return variants.map((skuid) => ({
    external_id: skuid,
    sku: skuid,
    barcode_raw: skuid.startsWith(`${pid}-`) && /^\d{8,14}$/.test(skuid.slice(pid.length + 1))
      ? skuid.slice(pid.length + 1)
      : null,
    currency,
    price,
  }));
}

/**
 * Traduce un documento de Bloomreach al contrato comun del sistema.
 *
 * Devuelve null cuando falta lo que identifica al articulo: sin pid no hay
 * llave de deduplicacion, y sin url la ficha no lleva a ningun lado.
 */
export function mapPriceSmartProduct(
  doc: BrDoc,
  config: Pick<PriceSmartConfig, 'webBaseUrl' | 'localePath'>,
  currency: string,
  categoryExternalId: string | null,
): NormalizedProduct | null {
  const externalId = (doc.pid ?? '').toString().trim();
  const name = doc.title?.trim();
  const url = buildPriceSmartUrl(doc, config);
  if (!externalId || !name || !url) return null;

  const price = minorToMajor(doc.price_HN, doc.fractionDigits);

  // `original_price_without_saving_HN` ya viene en unidades, no en centavos.
  // Solo cuenta como precio de lista si es de verdad mayor que el vigente:
  // asi la portada no se llena de "ofertas" del 0%.
  const originalPrice = toNumber(doc.original_price_without_saving_HN);
  const listPrice =
    originalPrice !== null && price !== null && originalPrice > price + 0.005
      ? round2(originalPrice)
      : null;

  // El ahorro viene negativo ("-60.0"); se guarda como magnitud positiva.
  const savingRaw = toNumber(doc.saving_amount_HN);
  const discountAmount =
    listPrice !== null && savingRaw !== null ? round2(Math.abs(savingRaw)) : null;
  const discountPercent =
    listPrice !== null && price !== null && listPrice > 0
      ? round2(((listPrice - price) / listPrice) * 100)
      : null;

  const availability = toAvailability(doc.inventory_HN);

  // Las etiquetas de campaña mezclan cosas utiles ("free-delivery") con
  // segmentos de marketing ("oktober-fest"). Se guardan tal cual en tags, y
  // solo las que significan algo para quien compara suben a badges.
  const promos = (doc.promoid_HN ?? []).filter(
    (tag): tag is string => typeof tag === 'string' && tag.trim().length > 0,
  );
  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (availability === 'out_of_stock') badges.push('agotado');
  if (promos.includes('free-delivery')) badges.push('envio gratis');
  if (promos.includes('new arrival')) badges.push('nuevo');

  const soldByWeight = String(doc.sold_by_weight_HN ?? '').toLowerCase() === 'true';
  const image = doc.thumb_image?.trim() || null;

  return {
    // Identidad. `pid` es el numero de articulo de PriceSmart: estable y unico.
    // NO se usa `master_sku`, que cambia cuando cambian las variantes
    // ("516787" hoy, "516787-0810186350673" al agregar presentaciones) y
    // partiria el historico de precios en dos.
    external_id: externalId,
    external_code: doc.master_sku?.toString().trim() || null,
    sku: doc.master_sku?.toString().trim() || externalId,
    name,
    url,
    slug: doc.slug?.trim() || null,
    barcode_raw: barcodeFromVariants(doc),

    description: doc.description?.trim() || null,
    brand_raw: doc.brand?.trim() || null,

    store_category_external_id: categoryExternalId,

    currency,
    price,
    list_price: listPrice,
    discount_amount: discountAmount,
    discount_percent: discountPercent,
    // El precio de PriceSmart es el precio de socio: solo se compra con membresia.
    member_price: price,
    price_per_unit: soldByWeight ? minorToMajor(doc.price_per_uom_HN, doc.fractionDigits) : null,
    unit_measure_name: soldByWeight ? doc.uom_description_HN?.trim() || null : null,
    unit_amount: soldByWeight ? toNumber(doc.weight_HN) : null,

    availability,
    in_stock: availability === 'unknown' ? null : availability === 'in_stock',

    primary_image_url: image,
    images: image ? [{ url: image, position: 0, is_primary: true, alt_text: name }] : [],

    tags: promos,
    badges,
    variants: mapVariants(doc, price, currency),

    raw: doc as unknown as Record<string, unknown>,
  };
}

/**
 * Arma el arbol de categorias con el facet que ya viene en la respuesta.
 *
 * `tree_path` trae el camino completo con nombres
 * ("/P10D51,Mascotas/P10D51004,Alimento y golosinas para perros"), asi que el
 * nivel sale de contarlo sin pedir nada mas.
 */
export function collectCategories(
  facets: BrCategoryFacet[] | undefined,
  into: Map<string, NormalizedCategory>,
): void {
  for (const facet of facets ?? []) {
    const externalId = facet.cat_id?.trim();
    const name = facet.cat_name?.trim();
    if (!externalId || !name) continue;

    const parent = facet.parent?.trim() || null;
    const level = facet.crumb ? facet.crumb.split('/').filter(Boolean).length : parent ? 2 : 1;

    const existing = into.get(externalId);
    // La misma categoria aparece en varias consultas; gana la de conteo mayor,
    // que es la que la vio completa.
    if (existing && (existing.product_count ?? 0) >= (facet.count ?? 0)) continue;

    into.set(externalId, {
      external_id: externalId,
      name,
      external_parent_id: parent,
      level,
      product_count: facet.count ?? null,
      raw: facet as unknown as Record<string, unknown>,
    });
  }
}

// -----------------------------------------------------------------------------
// 4. Configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): PriceSmartConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };

  // Ojo con `Number(x) || fallback`: un 0 explicito caeria en el fallback.
  const rawPageSize = raw.pageSize;
  const pageSize =
    rawPageSize === undefined || rawPageSize === null || rawPageSize === ''
      ? DEFAULTS.pageSize
      : Number(rawPageSize);

  const roots = Array.isArray(raw.rootCategories)
    ? raw.rootCategories.filter((code): code is string => typeof code === 'string' && code.trim() !== '')
    : [];

  return {
    apiUrl: str('apiUrl', DEFAULTS.apiUrl),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    localePath: str('localePath', DEFAULTS.localePath),
    accountId: str('accountId', DEFAULTS.accountId),
    authKey: str('authKey', DEFAULTS.authKey),
    domainKey: str('domainKey', DEFAULTS.domainKey),
    viewId: str('viewId', DEFAULTS.viewId),
    pageSize:
      Number.isFinite(pageSize) && pageSize > 0
        ? Math.min(Math.trunc(pageSize), MAX_PAGE_SIZE)
        : DEFAULTS.pageSize,
    categoryCode:
      typeof raw.categoryCode === 'string' && raw.categoryCode.trim() ? raw.categoryCode.trim() : null,
    rootCategories: roots.length > 0 ? roots.map((code) => code.trim()) : [...DEFAULT_ROOT_CATEGORIES],
    syncCategories: raw.syncCategories !== false,
    fieldList: str('fieldList', FIELD_LIST),
  };
}

/**
 * La url de la categoria que se manda como `url` y `ref_url`.
 *
 * Bloomreach los usa para atribuir la consulta a una pagina. No hace falta que
 * sea la url canonica (el nombre del segmento no se valida), pero mandarla
 * bien es lo honesto: es lo que el sitio manda cuando un visitante real navega.
 */
function categoryPageUrl(code: string, config: PriceSmartConfig): string {
  const locale = config.localePath.replace(/^\/+|\/+$/g, '');
  return `${config.webBaseUrl}/${locale}/categoria/${code}/${code}`;
}

// -----------------------------------------------------------------------------
// 5. Estrategia
// -----------------------------------------------------------------------------

export const pricesmartStrategy: ScrapeStrategy = {
  key: 'pricesmart',
  label: 'PriceSmart Honduras (Bloomreach Discovery)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'categoryCode',
      label: 'Codigo de categoria',
      example: 'P10D51',
      description:
        'Solo para targets de tipo categoria: el codigo que va al final de la url publica ' +
        '(/es-hn/categoria/Mascotas-P10D51/P10D51 -> P10D51). Incluye a sus subcategorias.',
    },
    {
      key: 'rootCategories',
      label: 'Categorias raiz',
      example: '["G10D03","H30D22"]',
      description:
        'Solo para targets de catalogo completo: lista de codigos de nivel 1 a barrer. ' +
        'Por defecto, las 25 del catalogo hondureño.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '200',
      description: 'Maximo real: 200. Con mas, el proxy responde 400.',
    },
    {
      key: 'viewId',
      label: 'Pais del catalogo',
      example: 'HN',
      description:
        'Sufijo de los campos por pais (price_HN, inventory_HN) y valor de view_id en la consulta.',
    },
    {
      key: 'syncCategories',
      label: 'Sincronizar categorias',
      example: 'true',
      description:
        'Arma el arbol de categorias con el facet que ya viene en la respuesta, sin peticiones extra.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];

    // Un target de categoria barre un codigo; uno de catalogo completo barre
    // las 25 raices, que entre todas cubren el catalogo (ver cabecera).
    const codes =
      ctx.target.kind === 'category'
        ? config.categoryCode
          ? [config.categoryCode]
          : []
        : config.rootCategories;

    if (codes.length === 0) {
      return {
        products: [],
        pagesFetched: 0,
        errors: [
          {
            stage: 'config',
            message: 'El target de categoria no define "categoryCode" en su configuracion',
          },
        ],
      };
    }

    const products: NormalizedProduct[] = [];
    const seen = new Set<string>();
    const categories = new Map<string, NormalizedCategory>();
    const perCategory: Record<string, { reported: number; fetched: number }> = {};
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let pagesFetched = 0;
    let totalReported = 0;
    let aborted = false;

    for (const code of codes) {
      if (aborted) break;

      const pageUrl = categoryPageUrl(code, config);
      let start = 0;
      let reported: number | null = null;
      let fetchedHere = 0;

      // Paginacion de una categoria. Tres salidas: lote vacio, lote corto y
      // haber alcanzado el total que declara la tienda. Mas el tope duro.
      while (pagesFetched < maxPages) {
        if (ctx.signal.aborted) {
          errors.push({
            stage: 'paginate',
            message: 'Corrida abortada por limite de tiempo',
            meta: { code, start },
          });
          aborted = true;
          break;
        }

        let page: BrResponse;
        try {
          page = await ctx.http.postJson<BrResponse>(config.apiUrl, [
            {
              url: pageUrl,
              ref_url: pageUrl,
              q: code,
              search_type: 'category',
              // Vacio a proposito: robots.txt pide no rastrear urls con `fq=`.
              fq: [],
              start,
              rows: config.pageSize,
              account_id: config.accountId,
              auth_key: config.authKey,
              domain_key: config.domainKey,
              view_id: config.viewId,
              fl: config.fieldList,
            },
          ]);
        } catch (error) {
          // Una categoria caida no debe tirar la corrida entera: se registra,
          // se corta esta y se sigue con la siguiente.
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: 'paginate', message, meta: { code, start } });
          ctx.log('error', `Fallo la categoria ${code} en start=${start}: ${message}`);
          break;
        }

        pagesFetched += 1;

        const body = page.response;
        if (!body) {
          errors.push({ stage: 'paginate', message: 'Respuesta sin cuerpo', meta: { code, start } });
          ctx.log('error', `La categoria ${code} respondio sin cuerpo en start=${start}`);
          break;
        }

        if (reported === null) {
          reported = body.numFound ?? 0;
          totalReported += reported;
        }

        if (config.syncCategories) {
          collectCategories(page.facet_counts?.facet_fields?.category, categories);
        }

        const batch = body.docs ?? [];
        if (batch.length === 0) break;

        for (const doc of batch) {
          const mapped = mapPriceSmartProduct(doc, config, currency, code);
          if (!mapped) continue;
          fetchedHere += 1;
          // Un articulo puede estar en dos departamentos (una aspiradora para
          // mascotas vive en Mascotas y en Electrodomesticos). Se queda la
          // primera aparicion: mandar duplicados rompe el ON CONFLICT del
          // upsert por lote.
          if (seen.has(mapped.external_id)) continue;
          seen.add(mapped.external_id);
          products.push(mapped);
        }

        start += config.pageSize;
        if (batch.length < config.pageSize) break;
        if (reported !== null && start >= reported) break;
      }

      perCategory[code] = { reported: reported ?? 0, fetched: fetchedHere };

      if (reported !== null && reported > 0 && fetchedHere < reported) {
        // Un barrido incompleto en un full_catalog daria de baja productos
        // vivos, asi que se reporta como error no fatal: el runner ya se salta
        // el delisting cuando `errors` no esta vacio.
        const message =
          `La categoria ${code} declara ${reported} articulos y solo se obtuvieron ${fetchedHere}`;
        errors.push({ stage: 'coverage', message, meta: { code, reported, fetched: fetchedHere } });
        ctx.log('warn', message);
      }
    }

    if (pagesFetched >= maxPages) {
      const message = `Se alcanzo el tope de ${maxPages} peticiones antes de terminar el barrido`;
      errors.push({ stage: 'paginate', message, meta: { maxPages } });
      ctx.log('warn', message);
    }

    return {
      products,
      categories: categories.size > 0 ? [...categories.values()] : undefined,
      pagesFetched,
      totalReported,
      errors,
      stats: {
        categoriesQueried: codes.length,
        pageSize: config.pageSize,
        viewId: config.viewId,
        uniqueProducts: products.length,
        totalReported,
        perCategory,
      },
    };
  },
};
