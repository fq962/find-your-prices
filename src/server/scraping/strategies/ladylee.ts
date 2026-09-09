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
 * Estrategia de scraping para Ladylee (https://ladylee.net).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * ladylee.net corre sobre Shopify. A diferencia de Diunsa el html SI trae los
 * productos (Shopify renderiza en el servidor), pero parsearlo seria trabajo
 * tirado: Shopify publica el mismo catalogo como json sin autenticacion, con
 * mas campos y sin depender de las clases css del tema, que cambian con cada
 * rediseño.
 *
 * Endpoints usados (ambos publicos, sin token):
 *   GET {webBaseUrl}/collections/{handle}/products.json?limit=250&page=N
 *       -> { products: [...] }   Vacio o incompleto = ultima pagina.
 *   GET {webBaseUrl}/collections/{handle}.json
 *       -> { collection: { id, title, handle, image, products_count } }
 *
 * Notas de campo verificadas contra el sitio (2026-09-08):
 *
 *   - limit maximo = 250. Con limit=500 Shopify responde 250 igual, sin error;
 *     por eso el valor se recorta aca en vez de confiar en la respuesta.
 *
 *   - La url publica es {webBaseUrl}/products/{handle}, sin el prefijo de la
 *     coleccion. Comprobado contra los enlaces reales de /collections/juguetes:
 *     coinciden 24/24. No hay que reconstruir slugs; Shopify entrega el handle.
 *
 *   - `products_count` de una coleccion NO sirve como total esperado: cuenta
 *     articulos que products.json no devuelve (sin publicar en el canal web).
 *     Medido: juguetes declara 1698 y entrega 1106; "all" declara 11837 y el
 *     sitemap lista 6463. Se guarda como referencia en la categoria y en
 *     stats, pero la paginacion NO corta por el.
 *
 *   - products.json NO trae el codigo de barras. Existe en
 *     /products/{handle}.js, pero eso es una peticion por articulo (~6500 en
 *     total). Decision tomada: no se recolecta. Ver NOTA_BARCODE abajo.
 *
 *   - `compare_at_price` viene lleno en el 100% del catalogo, tambien cuando no
 *     hay rebaja. Se aplica la regla del proyecto: solo cuenta como precio de
 *     lista si es estrictamente mayor al precio actual.
 *
 * ---------------------------------------------------------------------------
 * Como se barre el catalogo
 * ---------------------------------------------------------------------------
 * Un target `full_catalog` no pide /collections/all y ya: recorre las
 * colecciones del menu principal y al final barre "all" para recoger lo que no
 * cuelga de ninguna. Cuesta lo mismo en peticiones (los productos son los
 * mismos, repartidos) y a cambio cada articulo llega con su categoria puesta.
 * Como la deduplicacion se queda con la primera aparicion y "all" va de
 * ultimo, la categoria especifica siempre le gana al barrido generico.
 *
 * NOTA_BARCODE: sin barcode_raw el cruce con otras tiendas queda en similitud
 * de nombres. Si algun dia se quiere, el camino es enriquecer SOLO los
 * articulos nuevos o con precio cambiado desde /products/{handle}.js, nunca el
 * catalogo entero en cada corrida.
 */

// -----------------------------------------------------------------------------
// Respuesta de Shopify (interfaces locales, solo lo que se consume)
// -----------------------------------------------------------------------------

interface ShopifyImage {
  id?: number;
  position?: number;
  src?: string;
  width?: number | null;
  height?: number | null;
  variant_ids?: number[];
}

interface ShopifyVariant {
  id?: number;
  title?: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  sku?: string | null;
  available?: boolean;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  grams?: number | null;
  position?: number;
  featured_image?: ShopifyImage | null;
  [key: string]: unknown;
}

interface ShopifyOption {
  name?: string;
  position?: number;
  values?: string[];
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[];
  variants?: ShopifyVariant[];
  images?: ShopifyImage[];
  options?: ShopifyOption[];
  [key: string]: unknown;
}

interface ShopifyProductsPage {
  products?: ShopifyProduct[];
}

interface ShopifyCollection {
  id?: number;
  title?: string;
  handle?: string;
  description?: string | null;
  image?: { src?: string } | null;
  products_count?: number | null;
}

// -----------------------------------------------------------------------------
// Valores por defecto
// -----------------------------------------------------------------------------

/**
 * Las 13 categorias del menu principal, en el orden en que las muestra el
 * sitio. Los handles estan sacados de los enlaces reales del menu, NO
 * adivinados desde el nombre: cinco de ellos no coinciden con lo que uno
 * esperaria ("Celulares y Tablets" es /collections/celulares, "Hogar y
 * Decoracion" es /collections/hogar, y asi). Adivinarlos da 404.
 */
const DEFAULT_CATEGORY_HANDLES = [
  'juguetes',
  'tecnologia',
  'celulares',
  'linea-blanca',
  'electrodomesticos',
  'hogar',
  'muebles',
  'gimnasio',
  'cuidado-personal',
  'bebes',
  'automotriz',
  'temporada',
  'curiosidades-y-mas',
] as const;

/**
 * Nombre visible de cada categoria, tal como lo rotula el menu del sitio.
 *
 * Hace falta porque el `title` que Shopify devuelve esta escrito para
 * posicionamiento, no para leerse: la coleccion "cuidado-personal" se titula
 * "Articulos de Cuidado Personal en Honduras: Belleza y Bienestar". Guardar eso
 * llenaria el navegador de categorias del comparador de frases de una linea.
 * El titulo original no se pierde: queda en `raw` de la categoria.
 */
const CATEGORY_LABELS: Record<string, string> = {
  juguetes: 'Juguetes',
  tecnologia: 'Tecnología',
  celulares: 'Celulares y Tablets',
  'linea-blanca': 'Línea Blanca',
  electrodomesticos: 'Electrodomésticos',
  hogar: 'Hogar y Decoración',
  muebles: 'Muebles y Camas',
  gimnasio: 'Gimnasio y Deportes',
  'cuidado-personal': 'Cuidado Personal',
  bebes: 'Artículos para Bebé',
  automotriz: 'Automotriz',
  temporada: 'Temporada',
  'curiosidades-y-mas': 'Curiosidades y Más',
};

/**
 * Nombre legible de una coleccion: el rotulo del menu si es una de las
 * conocidas, y si no el titulo de Shopify o el propio handle.
 */
export function categoryLabel(handle: string, shopifyTitle?: string | null): string {
  return CATEGORY_LABELS[handle] ?? shopifyTitle ?? handle;
}

const DEFAULTS = {
  webBaseUrl: 'https://ladylee.net',
  pageSize: 250,
  collectionHandle: 'all',
} as const;

/** Handle de la coleccion que contiene todo el catalogo publicado. */
const ALL_HANDLE = 'all';

/** Limite duro de Shopify: pedir mas devuelve 250 igual. */
const MAX_PAGE_SIZE = 250;

/** Tope de paginas por coleccion. Evita un bucle infinito si Shopify cambia. */
const MAX_PAGES_PER_COLLECTION = 100;

/** Tope de paginas de la corrida entera, sumando todas las colecciones. */
const MAX_PAGES_HARD_LIMIT = 400;

interface LadyleeConfig {
  webBaseUrl: string;
  pageSize: number;
  collectionHandle: string;
  categoryHandles: string[];
  includeUncategorized: boolean;
  syncCategories: boolean;
}

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para poder probarlas sin red)
// -----------------------------------------------------------------------------

/** Convierte los precios en string de Shopify a numero, o null si no es valido. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  // Sin ningun digito no hay precio: "N/D" limpiado queda en cadena vacia y
  // Number('') vale 0, que se guardaria como un articulo gratis.
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Entidades html con nombre que aparecen en las descripciones de Ladylee. Son
 * casi todas vocales acentuadas: sin traducirlas, la ficha muestra
 * "Jenga Cl&aacute;sico" en vez de "Jenga Clasico".
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  eur: '€',
  trade: '™',
  reg: '®',
  copy: '©',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name] ?? match);
}

/**
 * Las descripciones de Ladylee son plantillas de marketing con css en linea:
 * varios kilobytes de <div style="..."> por articulo. Guardar eso tal cual en
 * `description` llenaria la ficha de basura, asi que se extrae solo el texto.
 * El html original sobrevive intacto en `raw`.
 */
export function stripHtml(html: string | null | undefined): string {
  const text = (html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  // Las entidades se traducen despues de quitar las etiquetas: al reves, un
  // "&lt;div&gt;" del texto se volveria etiqueta y se borraria.
  return stripLoneSurrogates(decodeEntities(text))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Quita los medios caracteres de emoji que quedan sueltos.
 *
 * UTF-16 guarda un emoji como dos unidades (un "par sustituto"). Cualquier
 * corte hecho por unidad puede dejar una mitad huerfana: JavaScript la acepta y
 * `JSON.stringify` la escribe como `\ud83c`, pero **Postgres rechaza ese
 * escape** al construir el `jsonb`. PostgREST devuelve entonces una respuesta
 * sin cuerpo y supabase-js informa "Empty or invalid json", un mensaje que no
 * apunta ni al campo ni al articulo. Ver la nota del README.
 */
export function stripLoneSurrogates(input: string): string {
  // Un alto sustituto que no va seguido de bajo, o un bajo que no va precedido
  // de alto: en ambos casos sobra.
  return input.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/**
 * Recorta a `maxLength` contando caracteres reales, no unidades UTF-16, y
 * cierra en el ultimo espacio para no partir una palabra por la mitad.
 */
export function truncate(input: string, maxLength: number): string {
  const chars = Array.from(input);
  if (chars.length <= maxLength) return input;

  const cut = chars.slice(0, maxLength).join('');
  const lastSpace = cut.lastIndexOf(' ');
  // Solo se retrocede al espacio si eso no deja un resumen demasiado corto.
  return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/** La url publica de Shopify: /products/{handle}, sin prefijo de coleccion. */
export function buildLadyleeProductUrl(handle: string, webBaseUrl: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/products/${handle}`;
}

function toAvailability(available: boolean | null): AvailabilityStatus {
  if (available === null) return 'unknown';
  return available ? 'in_stock' : 'out_of_stock';
}

function mapImages(product: ShopifyProduct): NormalizedImage[] {
  const images = Array.isArray(product.images) ? product.images : [];
  return images
    .filter((img): img is ShopifyImage & { src: string } => typeof img.src === 'string' && img.src.length > 0)
    .map((img, index) => ({
      url: img.src,
      external_id: img.id !== undefined ? String(img.id) : null,
      position: index,
      is_primary: index === 0,
      alt_text: product.title,
      width: img.width ?? null,
      height: img.height ?? null,
    }));
}

/** Las opciones reales del articulo, saltando el "Default Title" de Shopify. */
function variantOptions(variant: ShopifyVariant, options: ShopifyOption[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const values = [variant.option1, variant.option2, variant.option3];
  values.forEach((value, index) => {
    if (!value || value === 'Default Title') return;
    result[options[index]?.name ?? `option${index + 1}`] = value;
  });
  return result;
}

function mapVariants(product: ShopifyProduct): NormalizedVariant[] {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const options = Array.isArray(product.options) ? product.options : [];

  // Un articulo sin variantes reales trae una sola "Default Title" que Shopify
  // inventa. Emitirla crearia una fila de variante vacia por cada producto del
  // catalogo sin aportar nada.
  if (variants.length <= 1 && (variants[0]?.title ?? 'Default Title') === 'Default Title') return [];

  const mapped: NormalizedVariant[] = [];
  for (const variant of variants) {
    if (variant.id === undefined || variant.id === null) continue;

    const price = toNumber(variant.price);
    const compareAt = toNumber(variant.compare_at_price);
    const available = typeof variant.available === 'boolean' ? variant.available : null;

    mapped.push({
      external_id: String(variant.id),
      sku: variant.sku ?? null,
      name: variant.title ?? null,
      price,
      list_price: compareAt !== null && price !== null && compareAt > price ? compareAt : null,
      in_stock: available,
      availability: toAvailability(available),
      options: variantOptions(variant, options),
      image_url: variant.featured_image?.src ?? null,
    });
  }
  return mapped;
}

/** Contexto de la coleccion desde la que se leyo el articulo. */
export interface LadyleeCategoryContext {
  handle: string | null;
  title?: string | null;
}

/** Traduce un producto de Shopify al contrato comun del sistema. */
export function mapLadyleeProduct(
  product: ShopifyProduct,
  config: Pick<LadyleeConfig, 'webBaseUrl'>,
  currency: string,
  category: LadyleeCategoryContext = { handle: null },
): NormalizedProduct | null {
  if (!product?.id || !product?.title || !product?.handle) return null;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const primary = variants[0];

  // Con varias variantes el precio de portada es el mas bajo; min/max dan el
  // rango completo, que es lo que muestra Shopify como "desde X".
  const prices = variants.map((v) => toNumber(v.price)).filter((p): p is number => p !== null);
  const price = prices.length > 0 ? Math.min(...prices) : null;
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  // Ladylee rellena compare_at_price en todo el catalogo, tambien sin rebaja:
  // solo es precio de lista si de verdad es mayor.
  const compareAt = toNumber(primary?.compare_at_price);
  const listPrice = compareAt !== null && price !== null && compareAt > price ? compareAt : null;

  const inStock = variants.length > 0 ? variants.some((v) => v.available === true) : null;
  const images = mapImages(product);
  const descriptionText = stripHtml(product.body_html);

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (inStock === false) badges.push('agotado');

  return {
    // Identidad. external_id es el id numerico de Shopify: es la clave primaria
    // del producto y sobrevive a cambios de nombre, de handle y de categoria.
    external_id: String(product.id),
    name: product.title,
    url: buildLadyleeProductUrl(product.handle, config.webBaseUrl),
    slug: product.handle,
    sku: primary?.sku ?? null,
    // El sku de Ladylee es su codigo interno de articulo; el mismo numero
    // aparece como prefijo del handle ("1048240-jenga-clasico").
    external_code: primary?.sku ?? null,

    // Contenido
    description: descriptionText || null,
    // truncate corta por caracteres, no por unidades UTF-16: `slice` partia el
    // emoji final y dejaba media pareja que Postgres rechaza.
    short_description: descriptionText ? truncate(descriptionText, 300) : null,
    brand_raw: product.vendor ?? null,
    condition: 'new',

    // Clasificacion. product_type es un codigo interno de Ladylee ("LL030812"),
    // jerarquico pero sin nombre legible: sirve como atributo, no como
    // categoria de cara al usuario. La categoria util es la coleccion.
    store_category_external_id: category.handle,
    category_raw: category.title ?? category.handle ?? null,
    tags: Array.isArray(product.tags) ? product.tags : [],

    // Precio
    currency,
    price,
    list_price: listPrice,
    discount_percent:
      listPrice !== null && price !== null
        ? Number((((listPrice - price) / listPrice) * 100).toFixed(2))
        : null,
    discount_amount: listPrice !== null && price !== null ? Number((listPrice - price).toFixed(2)) : null,
    min_price: minPrice,
    max_price: maxPrice,
    // Shopify publica los precios de cara al cliente, con impuesto incluido.
    tax_included: true,

    // Disponibilidad. Shopify no expone la cantidad en products.json, solo el
    // booleano: stock_quantity se queda en null a proposito.
    availability: toAvailability(inStock),
    in_stock: inStock,

    // Medios
    primary_image_url: images[0]?.url ?? null,
    images,
    variants: mapVariants(product),

    // Logistica. Shopify manda grams:0 cuando nadie configuro el peso; eso no
    // es un articulo que no pesa nada, es un dato ausente.
    weight_grams: toNumber(primary?.grams) || null,

    // Datos libres
    attributes: {
      shopifyProductId: product.id,
      productType: product.product_type ?? null,
      options: Array.isArray(product.options) ? product.options : [],
      variantCount: variants.length,
      sourceCollection: category.handle,
    },
    badges,

    raw: product as unknown as Record<string, unknown>,
  };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return items.length > 0 ? items.map((v) => v.trim()) : null;
}

/** Saca el handle de una url de coleccion: .../collections/juguetes -> juguetes */
export function handleFromUrl(url: string | null | undefined): string | null {
  const match = /\/collections\/([a-z0-9][a-z0-9-]*)/i.exec(url ?? '');
  return match ? match[1].toLowerCase() : null;
}

function readConfig(raw: Record<string, unknown>, targetUrl: string | null): LadyleeConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };

  const pageSize = toNumber(raw.pageSize);

  return {
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    // Shopify recorta a 250 en silencio: mas vale pedir lo que va a dar.
    pageSize:
      pageSize !== null && pageSize > 0 ? Math.min(Math.floor(pageSize), MAX_PAGE_SIZE) : DEFAULTS.pageSize,
    // El handle puede venir en la config o deducirse de la url del target.
    collectionHandle: str('collectionHandle', handleFromUrl(targetUrl) ?? DEFAULTS.collectionHandle),
    categoryHandles: readStringArray(raw.categoryHandles) ?? [...DEFAULT_CATEGORY_HANDLES],
    includeUncategorized: raw.includeUncategorized !== false,
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const ladyleeStrategy: ScrapeStrategy = {
  key: 'ladylee',
  label: 'Ladylee (Shopify JSON)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'collectionHandle',
      label: 'Handle de la coleccion',
      example: 'juguetes',
      description:
        'Solo para targets de tipo categoria. Es el segmento de /collections/<handle>. Si el target tiene url, se deduce de ahi.',
    },
    {
      key: 'categoryHandles',
      label: 'Categorias del catalogo completo',
      example: '["juguetes","tecnologia","celulares"]',
      description:
        'Solo para full_catalog: colecciones que se recorren para que cada producto llegue con su categoria. Por defecto, las 13 del menu principal.',
    },
    {
      key: 'includeUncategorized',
      label: 'Barrer tambien /collections/all',
      example: 'true',
      description:
        'Recoge los productos que no cuelgan de ninguna categoria del menu. Dejalo en true: sin eso el barrido no cubre el catalogo y dar de baja lo ausente borraria articulos validos.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '250',
      description: 'Maximo aceptado por Shopify: 250.',
    },
    {
      key: 'syncCategories',
      label: 'Sincronizar categorias',
      example: 'true',
      description: 'Descarga el nombre y la imagen de cada coleccion recorrida (una peticion extra por coleccion).',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config, ctx.target.url);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];

    // --- 1. Que colecciones recorrer ----------------------------------------
    // Una categoria barre solo la suya. El catalogo completo pasa por las del
    // menu (para poblar la categoria) y cierra con "all", que recoge lo que no
    // aparecio en ninguna. El orden importa: "all" va de ultimo porque la
    // deduplicacion se queda con la primera aparicion, y esa es la que trae
    // categoria.
    const isFullCatalog = ctx.target.kind === 'full_catalog';
    const handles = isFullCatalog
      ? [...config.categoryHandles, ...(config.includeUncategorized ? [ALL_HANDLE] : [])]
      : [config.collectionHandle];

    const uniqueHandles = [...new Set(handles.filter((h) => h.length > 0))];
    if (uniqueHandles.length === 0) {
      throw new Error('No hay ninguna coleccion que recorrer: revisa collectionHandle / categoryHandles.');
    }

    const maxPagesPerCollection = Math.min(
      ctx.target.max_pages ?? MAX_PAGES_PER_COLLECTION,
      MAX_PAGES_PER_COLLECTION,
    );

    const products: NormalizedProduct[] = [];
    const categories: NormalizedCategory[] = [];
    const seen = new Set<string>();
    const perCollection: Record<string, number> = {};
    const declaredCounts: Record<string, number> = {};

    let pagesFetched = 0;
    let aborted = false;

    for (const handle of uniqueHandles) {
      if (aborted || pagesFetched >= MAX_PAGES_HARD_LIMIT) break;

      // --- 2. Ficha de la coleccion (opcional, una peticion) -----------------
      let categoryTitle: string | null = null;
      if (config.syncCategories && handle !== ALL_HANDLE) {
        try {
          const payload = await ctx.http.getJson<{ collection?: ShopifyCollection }>(
            `${config.webBaseUrl}/collections/${handle}.json`,
          );
          const collection = payload?.collection;
          if (collection?.handle) {
            categoryTitle = categoryLabel(collection.handle, collection.title);
            declaredCounts[handle] = collection.products_count ?? 0;
            categories.push({
              external_id: collection.handle,
              name: categoryTitle,
              slug: collection.handle,
              url: `${config.webBaseUrl}/collections/${collection.handle}`,
              level: 1,
              // Referencial: Shopify cuenta aqui articulos que products.json no
              // entrega, asi que no cuadra con lo que se guarda. Ver cabecera.
              product_count: collection.products_count ?? null,
              raw: collection as unknown as Record<string, unknown>,
            });
          }
        } catch (error) {
          // No es fatal: sin el titulo los productos igual se guardan con el
          // handle como categoria.
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: 'collection', message, meta: { handle } });
          ctx.log('warn', `No se pudo leer la ficha de /collections/${handle}: ${message}`);
        }
      }

      // --- 3. Paginado de productos -----------------------------------------
      const categoryContext: LadyleeCategoryContext =
        handle === ALL_HANDLE
          ? { handle: null }
          : { handle, title: categoryTitle ?? categoryLabel(handle) };

      let page = 1;
      let collected = 0;
      let completed = false;

      while (page <= maxPagesPerCollection && pagesFetched < MAX_PAGES_HARD_LIMIT) {
        if (ctx.signal.aborted) {
          errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo', meta: { handle, page } });
          aborted = true;
          break;
        }

        const url = `${config.webBaseUrl}/collections/${handle}/products.json?limit=${config.pageSize}&page=${page}`;
        let payload: ShopifyProductsPage;
        try {
          payload = await ctx.http.getJson<ShopifyProductsPage>(url);
        } catch (error) {
          // Una pagina caida no tira la corrida entera: se registra y se corta
          // esta coleccion. El error en la lista impide el markDelisted.
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: 'paginate', message, meta: { handle, page } });
          ctx.log('error', `Fallo /collections/${handle} pagina ${page}: ${message}`);
          break;
        }

        pagesFetched += 1;
        const batch = Array.isArray(payload.products) ? payload.products : [];
        if (batch.length === 0) {
          completed = true;
          break;
        }

        for (const item of batch) {
          const mapped = mapLadyleeProduct(item, config, currency, categoryContext);
          // Un articulo puede estar en varias colecciones: gana la primera, que
          // es la mas especifica porque "all" se recorre al final.
          if (mapped && !seen.has(mapped.external_id)) {
            seen.add(mapped.external_id);
            products.push(mapped);
            collected += 1;
          }
        }

        // Shopify no reporta el total: la ultima pagina es la que viene corta.
        if (batch.length < config.pageSize) {
          completed = true;
          break;
        }
        page += 1;
      }

      perCollection[handle] = collected;

      // Cortar por el tope de paginas deja el barrido incompleto. Se registra
      // como error para que el runner NO de de baja lo que no llego a ver.
      if (!completed && !aborted) {
        const message = `Barrido incompleto de /collections/${handle}: se alcanzo el tope de ${maxPagesPerCollection} paginas`;
        errors.push({ stage: 'paginate', message, meta: { handle, maxPagesPerCollection } });
        ctx.log('warn', message);
      }
    }

    if (pagesFetched >= MAX_PAGES_HARD_LIMIT) {
      const message = `Se alcanzo el tope global de ${MAX_PAGES_HARD_LIMIT} paginas: el barrido puede estar incompleto`;
      errors.push({ stage: 'paginate', message });
      ctx.log('warn', message);
    }

    ctx.log('info', `Ladylee: ${products.length} articulos unicos en ${pagesFetched} peticiones de catalogo`, {
      perCollection,
    });

    return {
      products,
      categories: categories.length > 0 ? categories : undefined,
      pagesFetched,
      errors,
      stats: {
        collections: uniqueHandles,
        perCollection,
        // Lo que Shopify dice tener por coleccion. Siempre mayor que lo
        // entregado: incluye articulos no publicados en el canal web.
        declaredCounts,
        pageSize: config.pageSize,
        includeUncategorized: isFullCatalog && config.includeUncategorized,
      },
    };
  },
};
