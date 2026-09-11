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
 * Estrategia de scraping para Comisariato Los Andes (https://comisariatolosandes.com).
 *
 * ---------------------------------------------------------------------------
 * Por que no se parsea el html
 * ---------------------------------------------------------------------------
 * Es un Angular Universal (SSR): el html trae el arbol de categorias completo
 * hidratado en `<script id="ng-state">`, pero **no trae productos** -- una
 * pagina de categoria real (ej. `/panaderia-y-reposteria`) devuelve el mismo
 * `ng-state` que el home, sin listado. Las tarjetas las pinta el navegador
 * contra una API aparte.
 *
 * Esa API resulto ser la misma familia de plataforma que Diunsa (ver
 * `strategies/diunsa.ts`): mismos nombres de campo (`groupCode`, `officeCode`,
 * `materialGroupCode`, `availibilityCount`...) y mismo prefijo de ruta
 * (`api/em/material/...`), pero alojada en un dominio propio del comercio en
 * vez del dominio multi-tenant de Diunsa. Nada de esto esta documentado
 * publicamente ni aparece como string literal en el bundle principal
 * (`main-*.js`): el objeto de configuracion (`domain`, `url_amazon_s3`...) y
 * el servicio que arma las urls de la API viven en chunks de Angular cargados
 * solo al navegar a una ruta con productos, no en los que la portada
 * precarga. Hubo que bajar los ~150 chunks que el bundle principal referencia
 * (no solo los que la portada precarga) y buscar el objeto de configuracion
 * dentro de ellos.
 *
 * Endpoints usados:
 *   POST {apiBaseUrl}/material/paginate?skip=N&take=M
 *        body: { businessPartner, groupCode, officeCode, type, sortBy,
 *                sortOption, search, filter, source, hidden }
 *        -> { totalItems, totalPages, data: [...] }
 *   GET  {apiBaseUrl}/material_group/get_cb/{businessPartner}
 *        -> arbol de categorias [{ code, name, parentCode, hasSubCategory }]
 *
 * ---------------------------------------------------------------------------
 * Notas de campo verificadas contra el sitio (2026-09-11)
 * ---------------------------------------------------------------------------
 *
 *   - **El body minimo de Diunsa (`{groupCode, officeCode, filter}`) no
 *     alcanza aca**: sin `businessPartner` la API responde 201 con
 *     `totalItems: 0` (no un error, asi que es facil no notarlo). El
 *     `businessPartner` (aca `1`) identifica al comercio dentro de la
 *     plataforma multi-tenant; se saco de la configuracion embebida en uno de
 *     los chunks (`{id:1,name:"Comisariato Los Andes",...}`).
 *
 *   - **`officeCode` es `"0"`, no `"1"` como en Diunsa.** El mismo objeto de
 *     configuracion trae `officeCodeService:!1`: esta tienda no separa precio
 *     ni stock por sucursal.
 *
 *   - **`take` no tiene tope real detectado.** Se probo 2000, 5000 y 10000 (el
 *     catalogo entero, ~6700 articulos) y los tres devolvieron los items
 *     pedidos sin error. Aun asi se pagina por cortesia en vez de pedir todo
 *     de una vez.
 *
 *   - **El campo `stock` NO es el inventario real.** Verificado: dos
 *     articulos con `availibilityCount` 1000 y 0 (uno con existencia, el otro
 *     agotado) traen **el mismo** `stock: 100` en ambos. Es un valor fijo de
 *     la API, no una señal de disponibilidad. La señal real es
 *     `availibilityCount`, igual que en Diunsa -- pero ahi conviene invertir
 *     la prioridad: Diunsa hace `stock ?? availibilityCount` (stock primero);
 *     aca `stock` esta siempre presente y siempre miente, asi que hay que
 *     leer `availibilityCount` primero.
 *
 *   - **La mayoria del catalogo reporta `availibilityCount: 0`.** Verificado
 *     sobre una muestra de 1000 articulos ya cargados: 999 salen
 *     `out_of_stock`, solo 1 `in_stock`. No es un bug de esta estrategia ni un
 *     snapshot desactualizado -- se confirmo pidiendo el endpoint de detalle
 *     de un articulo puntual (`GET .../material/get/{code}/{type}/{office}`)
 *     por separado, y reporta el mismo `availibilityCount: 0` que el
 *     paginado. Es asi como la propia API de la tienda responde ahora mismo
 *     para `officeCode: "0"`. Puede ser una sucursal por defecto sin
 *     inventario real cargado (el sitio no dejo claro cual `officeCode` usa
 *     un visitante real hasta que elige direccion de entrega), o un problema
 *     genuino de sincronizacion de inventario del lado de la tienda. De
 *     cualquier forma, el runner ya filtra `out_of_stock` del catalogo
 *     publico por defecto (ver `catalog.ts`), asi que hoy el efecto practico
 *     es que casi nada de Comisariato aparece en las busquedas normales. Vale
 *     la pena revisar si aparece otro `officeCode` real mas adelante.
 *
 *   - **La url publica se arma con dos funciones de slug distintas**, ambas
 *     recuperadas del bundle (`transformToSnakeCase` para la categoria,
 *     `transformToSlug` para el nombre) y verificadas al 100% contra
 *     `https://comisariatolosandes.com/sitemaps/products-sitemap.xml` (sitemap
 *     real, no el generico de la SPA):
 *
 *       {webBaseUrl}/{transformToSnakeCase(materialGroupName)}/{transformToSlug(name)}-{sufijo}
 *
 *     El sufijo es el segundo segmento de `code` separado por "-", con los
 *     ceros a la izquierda recortados via `Number()`:
 *     `"0001-000099001005224"` -> `"99001005224"`. Comprobado contra
 *     `ready-to-go/ready-to-go-aderezo-para-ensaladas-99001005224`, la
 *     entrada real del sitemap para ese articulo exacto.
 *
 *   - **Las imagenes son relativas a un bucket S3 propio**, no al dominio de
 *     la API ni al del sitio:
 *     `https://comisariatolosandesfiles.s3.us-east-2.amazonaws.com/folder/products/500X500/{fileName}`.
 *     Verificado que resuelve 200 contra un archivo real.
 *
 *   - **`robots.txt` no restringe nada** (`User-agent: *` sin `Disallow`).
 */

interface ComisariatoImage {
  id?: number;
  fileName?: string | null;
  displayName?: string | null;
  position?: number | null;
  active?: string | null;
}

interface ComisariatoItem {
  code: string;
  name: string;
  description?: string | null;
  tax?: string | number | null;
  unitMeasureCode?: string | null;
  unitMeasureName?: string | null;
  discount?: string | number | null;
  oldPrice?: string | number | null;
  newPrice?: string | number | null;
  price?: string | number | null;
  /** Siempre presente y siempre 100 en lo observado: NO es el stock real. Ver cabecera. */
  stock?: number | null;
  availibilityCount?: number | null;
  minimunStock?: number | null;
  cartCount?: number | null;
  specs?: unknown;
  colors?: unknown[];
  sizes?: unknown[];
  brandId?: number | null;
  brandName?: string | null;
  materialGroupCode?: string | null;
  materialGroupName?: string | null;
  images?: ComisariatoImage[];
  is_adult?: string | null;
  bulletPoint?: string | null;
  [key: string]: unknown;
}

interface ComisariatoPage {
  totalItems: number;
  totalPages: number;
  itemPerPage: number;
  currentPage: number;
  data: ComisariatoItem[];
}

interface ComisariatoCategory {
  code: string;
  name: string;
  parentCode?: string | null;
  hasSubCategory?: string | null;
}

const DEFAULTS = {
  apiBaseUrl: 'https://andes.aveapplications.com/api/em',
  webBaseUrl: 'https://comisariatolosandes.com',
  imageBaseUrl: 'https://comisariatolosandesfiles.s3.us-east-2.amazonaws.com/folder',
  businessPartner: '1',
  officeCode: '0',
  deliveryType: 'PD',
  pageSize: 2000,
  groupCode: '0',
} as const;

/** Tope de seguridad: evita un bucle infinito si la API deja de paginar bien. */
const MAX_PAGES_HARD_LIMIT = 100;

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

/**
 * `transformToSnakeCase` del bundle: pese al nombre, produce kebab-case. Se
 * usa para el segmento de categoria de la url ("READY TO GO" -> "ready-to-go").
 */
export function comisariatoSnakeSlug(input: string | null | undefined): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]+/g, '')
    .trim()
    .replace(/ /g, '-')
    .toLowerCase();
}

/**
 * `transformToSlug` del bundle: se usa para el segmento de nombre de la url.
 * Distinto de `comisariatoSnakeSlug` a proposito -- aca sobreviven parentesis
 * y comas hasta que se recortan explicitamente, y las barras se vuelven guion.
 */
export function comisariatoSlug(input: string | null | undefined): string {
  return (input ?? '')
    .replace(/\+/g, '')
    .replace(/\s\s+/g, ' ')
    .replace(/ /g, '-')
    .replace(/\//g, '-')
    .replace(/[(),]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Sufijo numerico de `code`: el segundo segmento separado por "-", sin ceros a
 * la izquierda. `"0001-000099001005224"` -> `"99001005224"`.
 */
export function comisariatoShortCode(code: string): string {
  const parts = String(code).split('-');
  const tail = parts[1] ?? parts[0] ?? '';
  const digits = tail.replace(/\D/g, '');
  if (!digits) return tail;
  const n = Number(digits);
  return Number.isFinite(n) ? String(n) : digits;
}

export function buildComisariatoProductUrl(
  item: Pick<ComisariatoItem, 'code' | 'name' | 'materialGroupName'>,
  webBaseUrl: string,
): string {
  const categorySegment = comisariatoSnakeSlug(item.materialGroupName) || 'producto';
  const nameSegment = comisariatoSlug(item.name);
  return `${webBaseUrl.replace(/\/+$/, '')}/${categorySegment}/${nameSegment}-${comisariatoShortCode(item.code)}`;
}

export function buildComisariatoImageUrl(fileName: string | null | undefined, imageBaseUrl: string): string | null {
  const name = fileName?.trim();
  if (!name) return null;
  return `${imageBaseUrl.replace(/\/+$/, '')}/products/500X500/${name}`;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * `availibilityCount` primero: `stock` esta siempre presente y siempre en
 * 100 en lo observado (ver cabecera), asi que si se lo prioriza como en
 * Diunsa, todo el catalogo saldria "en existencia".
 *
 * `<= 0` se mapea a `unknown`, no a `out_of_stock`, a proposito: verificado
 * (cabecera) que hoy el 99.9% del catalogo trae `availibilityCount: 0`
 * incluso en el endpoint de detalle -- no hay forma de distinguir "agotado de
 * verdad" de "esta sucursal (`officeCode: 0`, probablemente no real) no tiene
 * inventario cargado". `out_of_stock` sale del catalogo publico por defecto
 * (ver `UNAVAILABLE_STATES` en `catalog.ts`); marcarlo asi habria escondido
 * casi toda la tienda por un dato que no se puede confiar. `unknown` sí se
 * muestra, con precio real, y deja afuera solo lo que de verdad se sabe que
 * no esta.
 */
function toAvailability(availibilityCount: number | null, stock: number | null): AvailabilityStatus {
  const real = availibilityCount ?? stock;
  if (real === null || real <= 0) return 'unknown';
  if (real <= 5) return 'limited';
  return 'in_stock';
}

function mapImages(item: ComisariatoItem, imageBaseUrl: string): NormalizedImage[] {
  const images = Array.isArray(item.images) ? item.images : [];
  return images
    .map((img) => ({ img, url: buildComisariatoImageUrl(img.fileName, imageBaseUrl) }))
    .filter((entry): entry is { img: ComisariatoImage; url: string } => entry.url !== null)
    .map(({ img, url }, index) => ({
      url,
      external_id: img.id !== undefined ? String(img.id) : null,
      position: index,
      is_primary: index === 0,
      alt_text: img.displayName ?? item.name,
    }));
}

/** Traduce un articulo de la API al contrato comun del sistema. */
export function mapComisariatoItem(
  item: ComisariatoItem,
  config: Pick<ComisariatoConfig, 'webBaseUrl' | 'imageBaseUrl'>,
  currency: string,
): NormalizedProduct | null {
  if (!item?.code || !item?.name) return null;

  const price = toNumber(item.newPrice ?? item.price);
  const oldPrice = toNumber(item.oldPrice);
  // Se repite el precio en oldPrice cuando no hay descuento real: solo cuenta
  // como precio de lista si es de verdad mayor.
  const listPrice = oldPrice !== null && price !== null && oldPrice > price ? oldPrice : null;
  const availibilityCount = toNumber(item.availibilityCount);
  const stock = toNumber(item.stock);
  const availability = toAvailability(availibilityCount, stock);
  const realStock = availibilityCount ?? stock;
  const images = mapImages(item, config.imageBaseUrl);

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  // No hay badge de "agotado": `toAvailability` nunca devuelve `out_of_stock`
  // para esta tienda a proposito (ver su comentario).

  return {
    external_id: item.code,
    sku: item.code,
    name: item.name,
    url: buildComisariatoProductUrl(item, config.webBaseUrl),
    slug: `${comisariatoSlug(item.name)}-${comisariatoShortCode(item.code)}`,

    description: item.description ?? null,
    brand_raw: item.brandName ?? null,
    condition: 'new',
    is_adult: item.is_adult === '1',

    store_category_external_id: item.materialGroupCode ?? null,
    category_raw: item.materialGroupName ?? null,

    currency,
    price,
    list_price: listPrice,
    // No se usa el `discount` crudo de la API: en el lote 1000-1250 trajo un
    // valor fuera de 0-100 y violo el check de la base. Se calcula del precio,
    // que por construccion siempre cae en rango porque listPrice > price.
    discount_percent:
      listPrice !== null && price !== null && listPrice > 0
        ? Number((((listPrice - price) / listPrice) * 100).toFixed(2))
        : null,
    discount_amount: listPrice !== null && price !== null ? Number((listPrice - price).toFixed(2)) : null,
    unit_measure_code: item.unitMeasureCode ?? null,
    unit_measure_name: item.unitMeasureName ?? null,
    tax_rate: toNumber(item.tax),
    tax_included: true,

    availability,
    in_stock: availability === 'unknown' ? null : realStock !== null && realStock > 0,
    stock_quantity: realStock,
    min_order_quantity: toNumber(item.cartCount),

    primary_image_url: images[0]?.url ?? null,
    images,

    specs: (item.specs && typeof item.specs === 'object' ? (item.specs as Record<string, unknown>) : {}),
    attributes: {
      brandId: item.brandId ?? null,
      colors: item.colors ?? [],
      sizes: item.sizes ?? [],
      minimunStock: item.minimunStock ?? null,
    },
    badges,

    raw: item as unknown as Record<string, unknown>,
  };
}

// -----------------------------------------------------------------------------
// Configuracion
// -----------------------------------------------------------------------------

interface ComisariatoConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  imageBaseUrl: string;
  businessPartner: string;
  officeCode: string;
  deliveryType: string;
  pageSize: number;
  groupCode: string;
  syncCategories: boolean;
}

function readConfig(raw: Record<string, unknown>): ComisariatoConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  };

  const rawPageSize = raw.pageSize;
  const pageSize =
    rawPageSize === undefined || rawPageSize === null || rawPageSize === ''
      ? DEFAULTS.pageSize
      : Number(rawPageSize);

  return {
    apiBaseUrl: str('apiBaseUrl', DEFAULTS.apiBaseUrl).replace(/\/+$/, ''),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    imageBaseUrl: str('imageBaseUrl', DEFAULTS.imageBaseUrl).replace(/\/+$/, ''),
    businessPartner: str('businessPartner', DEFAULTS.businessPartner),
    officeCode: str('officeCode', DEFAULTS.officeCode),
    deliveryType: str('deliveryType', DEFAULTS.deliveryType),
    // No se detecto tope real (ver cabecera), pero se acota por cortesia.
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.trunc(pageSize), 5000) : DEFAULTS.pageSize,
    groupCode: str('groupCode', DEFAULTS.groupCode),
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const comisariatoStrategy: ScrapeStrategy = {
  key: 'comisariato',
  label: 'Comisariato Los Andes (API JSON, misma familia que Diunsa)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'groupCode',
      label: 'Codigo de categoria',
      example: '1100',
      description: 'Codigo de la categoria (materialGroupCode). "0" = catalogo completo.',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '2000',
      description: 'No se detecto tope real; se manda paginado por cortesia igual.',
    },
    {
      key: 'businessPartner',
      label: 'Identificador del comercio',
      example: '1',
      description: 'Escopo multi-tenant de la API. Sin este campo la API responde 201 con 0 items.',
    },
    {
      key: 'officeCode',
      label: 'Codigo de sucursal',
      example: '0',
      description: 'Esta tienda no separa precio/stock por sucursal: siempre "0".',
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
        const raw = await ctx.http.getJson<ComisariatoCategory[]>(
          `${config.apiBaseUrl}/material_group/get_cb/${config.businessPartner}`,
        );
        categories = (Array.isArray(raw) ? raw : [])
          .filter((c) => c?.code && c?.name)
          .map((c) => ({
            external_id: String(c.code),
            name: c.name,
            // La raiz se marca a si misma como padre; se corta para no ciclar.
            external_parent_id:
              c.parentCode && String(c.parentCode) !== String(c.code) ? String(c.parentCode) : null,
            slug: comisariatoSnakeSlug(c.name),
            url: `${config.webBaseUrl}/${comisariatoSnakeSlug(c.name)}`,
            raw: c as unknown as Record<string, unknown>,
          }));
        ctx.log('info', `Categorias sincronizadas: ${categories.length}`);
      } catch (error) {
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
      let page: ComisariatoPage;
      try {
        page = await ctx.http.postJson<ComisariatoPage>(url, {
          businessPartner: Number(config.businessPartner) || config.businessPartner,
          groupCode: config.groupCode,
          officeCode: config.officeCode,
          type: config.deliveryType,
          sortBy: 'category',
          sortOption: 'ASC',
          search: '',
          filter: { priceMin: null, priceMax: null, brand: null, supplier: null },
          source: 'WEB',
          hidden: '0',
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
        const mapped = mapComisariatoItem(item, config, currency);
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
      ctx.log('warn', `Se obtuvieron ${products.length} de ${totalReported} articulos que reporta la tienda`);
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
