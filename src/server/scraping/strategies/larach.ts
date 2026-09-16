import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedImage,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { stripHtml, toNumber, truncate } from './ladylee';

/**
 * Estrategia de scraping para Larach y Cia (https://larachycia.com), ferreteria.
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-15)
 * ---------------------------------------------------------------------------
 * larachycia.com es un Angular con render en servidor: el html SI trae las 32
 * tarjetas de la pagina, pero las pinta contra una API JSON propia en AWS API
 * Gateway que devuelve bastante mas que la tarjeta: stock, impuesto, peso,
 * dimensiones, numero de catalogo del proveedor, ficha tecnica y descuentos.
 * La url base vive en el bundle (`main-es2015.*.js`) y se llama sin ninguna
 * cabecera de autenticacion.
 *
 * Endpoints usados:
 *   POST {apiBaseUrl}/items
 *        body: { paginate: { page, pageSize, records: 0, orderBy },
 *                category?: "<id>", "get-categories"?: true }
 *        -> { data: [...], paginate: { page, pageSize, records }, categories? }
 *
 * Notas de campo verificadas contra el sitio:
 *   - Sin `category` devuelve el catalogo completo: 26 226 articulos.
 *   - `pageSize` no tiene tope practico (2000 responde 200 con 3.5 MB), pero
 *     cada pagina de 1000 tarda ~5 s: el catalogo entero no cabe en el
 *     presupuesto del runner, por eso se barre por departamento (18 targets
 *     de categoria, ver la migracion 0029).
 *   - Consultar un departamento (`category: "3"`) incluye a sus subcategorias.
 *     Los 18 departamentos suman exactamente los 26 226 del catalogo.
 *   - `get-categories: true` devuelve el arbol entero (523 subcategorias con su
 *     `parent`). Los departamentos NO vienen como filas propias: se derivan
 *     de los `parent` distintos. `GET /items/categories` responde 401.
 *   - La url publica es /p/{slug(itemName)}/{itemCode}, con un slug peculiar
 *     (encodeURI y despues todo lo que no sea [a-zA-Z0-9-_] pasa a guion).
 *     Comprobada al 100 % contra 64 enlaces reales de dos categorias.
 *   - Las imagenes vienen relativas (`media/items/05430050.webp`) y cuelgan de
 *     https://media.larachycia.com/.
 *   - `visited`, `createDate` y `updateDate` cambian sin que cambie el
 *     articulo: no se copian a ningun campo para no ensuciar el hash.
 */

interface LarachConfig {
  apiBaseUrl: string;
  webBaseUrl: string;
  mediaBaseUrl: string;
  pageSize: number;
  /** Id del departamento en la tienda; vacio = catalogo completo. */
  category: string;
  syncCategories: boolean;
}

interface LarachMedia {
  id?: string;
  fileName?: string;
  url?: string | null;
  main?: boolean;
}

interface LarachMeasure {
  itemCode?: string;
  unitMsr?: string;
  itemsPerUnit?: number;
  lastPrice?: number;
  price?: number;
}

export interface LarachItem {
  id?: number;
  itemCode?: string;
  suppCatNum?: string | null;
  itemName?: string;
  foreigName?: string | null;
  sellUnit?: string | null;
  itemsPerUnit?: number | null;
  taxCode?: string | null;
  taxPercent?: number | null;
  stock?: number | null;
  category?: { id?: number; name?: string } | null;
  supplier?: string | null;
  brand?: string | null;
  longDescription?: string | null;
  shortDescription?: string | null;
  additionalInfo?: string | null;
  isActive?: boolean;
  url?: string | null;
  maxSalesQuantity?: number | null;
  minSalesQuantity?: number | null;
  weight2?: number | null;
  weightUnit2?: string | null;
  width1?: number | null;
  height1?: number | null;
  len1?: number | null;
  dimensionUnit1?: string | null;
  storeOnly?: boolean;
  discount?: number | null;
  lastPrice?: number | null;
  price?: number | null;
  isNew?: boolean;
  media?: LarachMedia[];
  measures?: LarachMeasure[];
}

interface LarachCategory {
  id?: number;
  name?: string;
  position?: number | null;
  level?: number;
  parent?: { id?: number; name?: string } | null;
}

interface LarachPage {
  data?: LarachItem[];
  paginate?: { page?: number; pageSize?: number; records?: number };
  categories?: LarachCategory[];
}

const DEFAULTS: LarachConfig = {
  apiBaseUrl: 'https://k1t4zxzvq8.execute-api.us-east-2.amazonaws.com/dev',
  webBaseUrl: 'https://larachycia.com',
  mediaBaseUrl: 'https://media.larachycia.com',
  pageSize: 1000,
  category: '',
  syncCategories: true,
};

/** Tope duro de peticiones por corrida; el departamento mas grande usa 5. */
const MAX_PAGES_HARD_LIMIT = 60;
const MAX_DESCRIPTION_CHARS = 2000;

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

/**
 * Replica exacta del slug del sitio (clase `Ds` del bundle):
 *
 *   encodeURI(name.replace(/ /g,'-').replace(/\)/g,''))
 *     .replace(/[^a-zA-Z0-9-_]/g,'-')
 *     .replace(/--/g,'-')
 *
 * La ultima sustitucion es de una sola pasada, igual que en el sitio: "---"
 * queda como "--". Cambiarla por un colapso total romperia enlaces.
 */
export function larachSlug(name: string): string {
  return encodeURI(name.replace(/ /g, '-').replace(/\)/g, ''))
    .replace(/[^a-zA-Z0-9\-_]/g, '-')
    .replace(/--/g, '-');
}

export function buildLarachProductUrl(item: Pick<LarachItem, 'url' | 'itemName' | 'itemCode'>, webBaseUrl: string): string {
  const path = item.url && item.url !== '' ? item.url : larachSlug(item.itemName ?? '');
  return `${webBaseUrl.replace(/\/+$/, '')}/p/${path}/${item.itemCode}`;
}

export function buildLarachCategoryUrl(name: string, id: string | number, webBaseUrl: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/c/${larachSlug(name)}/${id}`;
}

/**
 * `additionalInfo` es una tabla html de dos columnas (Peso, Dimensiones,
 * Marca, N° catalogo...). Se convierte a clave/valor para `specs`.
 */
export function parseAdditionalInfo(html: string | null | undefined): Record<string, string> {
  const specs: Record<string, string> = {};
  if (!html) return specs;
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) ?? []).map((cell) => stripHtml(cell));
    if (cells.length >= 2 && cells[0] && cells[1]) specs[cells[0]] = cells[1];
  }
  return specs;
}

function toAvailability(stock: number | null, active: boolean): AvailabilityStatus {
  if (!active) return 'discontinued';
  if (stock === null) return 'unknown';
  if (stock <= 0) return 'out_of_stock';
  if (stock <= 5) return 'limited';
  return 'in_stock';
}

function mapImages(item: LarachItem, mediaBaseUrl: string): NormalizedImage[] {
  const media = Array.isArray(item.media) ? item.media : [];
  const base = mediaBaseUrl.replace(/\/+$/, '');
  return media
    .filter((m) => typeof m.url === 'string' && m.url.length > 0)
    .map((m, index) => ({
      url: /^https?:\/\//.test(m.url as string) ? (m.url as string) : `${base}/${(m.url as string).replace(/^\/+/, '')}`,
      external_id: m.id ?? null,
      position: index,
      is_primary: index === 0,
      alt_text: item.itemName ?? null,
    }));
}

/** cm/mm/m -> mm. Solo se conocen 'cm' en el sitio; lo demas se deja en null. */
function toMillimeters(value: number | null | undefined, unit: string | null | undefined): number | null {
  const n = toNumber(value);
  if (n === null || n <= 0) return null;
  switch ((unit ?? '').toLowerCase()) {
    case 'cm':
      return Math.round(n * 10);
    case 'mm':
      return Math.round(n);
    case 'm':
      return Math.round(n * 1000);
    default:
      return null;
  }
}

function toGrams(value: number | null | undefined, unit: string | null | undefined): number | null {
  const n = toNumber(value);
  if (n === null || n <= 0) return null;
  switch ((unit ?? '').toLowerCase()) {
    case 'kg':
      return Math.round(n * 1000);
    case 'g':
      return Math.round(n);
    case 'lb':
      return Math.round(n * 453.592);
    default:
      return null;
  }
}

/** Traduce un articulo de la API de Larach al contrato comun del sistema. */
export function mapLarachItem(
  item: LarachItem,
  config: Pick<LarachConfig, 'webBaseUrl' | 'mediaBaseUrl'>,
  currency: string,
  departmentByCategoryId: Map<string, string> = new Map(),
): NormalizedProduct | null {
  if (!item?.itemCode || !item?.itemName) return null;

  const price = toNumber(item.price);
  const lastPrice = toNumber(item.lastPrice);
  // lastPrice repite el precio cuando no hay rebaja: solo cuenta como precio
  // de lista si de verdad es mayor.
  const listPrice = lastPrice !== null && price !== null && lastPrice > price ? lastPrice : null;
  const stock = toNumber(item.stock);
  const active = item.isActive !== false;
  const images = mapImages(item, config.mediaBaseUrl);
  const categoryId = item.category?.id !== undefined && item.category?.id !== null ? String(item.category.id) : null;
  const categoryName = item.category?.name ?? null;
  const department = categoryId ? departmentByCategoryId.get(categoryId) : undefined;

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (item.isNew) badges.push('nuevo');
  if (item.storeOnly) badges.push('solo-en-tienda');

  const description = stripHtml(item.longDescription);
  const shortDescription = stripHtml(item.shortDescription);
  const measures = Array.isArray(item.measures) ? item.measures : [];

  return {
    // Identidad. itemCode es el codigo interno del articulo (8 digitos) y es
    // lo que el propio sitio usa en la url: estable.
    external_id: item.itemCode,
    sku: item.itemCode,
    mpn: item.suppCatNum ?? null,
    name: item.itemName,
    name_alias: item.foreigName?.trim() || null,
    url: buildLarachProductUrl(item, config.webBaseUrl),
    slug: larachSlug(item.itemName),

    // Contenido
    short_description: shortDescription ? truncate(shortDescription, 300) : null,
    description: description ? truncate(description, MAX_DESCRIPTION_CHARS) : null,
    brand_raw: item.brand?.trim() || null,
    condition: 'new',

    // Clasificacion: la API solo da la subcategoria; el departamento se
    // resuelve con el arbol que trae la primera pagina.
    store_category_external_id: categoryId,
    category_raw: categoryName,
    category_path: [department, categoryName].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    ),

    // Precio
    currency,
    price,
    list_price: listPrice,
    discount_percent: listPrice !== null ? toNumber(item.discount) : null,
    discount_amount: listPrice !== null && price !== null ? Number((listPrice - price).toFixed(2)) : null,
    unit_measure_code: item.sellUnit ?? null,
    unit_amount: toNumber(item.itemsPerUnit) || null,
    tax_rate: toNumber(item.taxPercent),
    tax_included: true,

    // Disponibilidad
    availability: toAvailability(stock, active),
    in_stock: stock === null ? null : stock > 0,
    stock_quantity: stock,
    min_order_quantity: toNumber(item.minSalesQuantity) || null,
    max_order_quantity: toNumber(item.maxSalesQuantity) || null,

    // Medios
    primary_image_url: images[0]?.url ?? null,
    images,

    // Logistica
    weight_grams: toGrams(item.weight2, item.weightUnit2),
    width_mm: toMillimeters(item.width1, item.dimensionUnit1),
    height_mm: toMillimeters(item.height1, item.dimensionUnit1),
    length_mm: toMillimeters(item.len1, item.dimensionUnit1),

    // Datos libres
    specs: parseAdditionalInfo(item.additionalInfo),
    attributes: {
      supplier: item.supplier ?? null,
      taxCode: item.taxCode ?? null,
      storeOnly: Boolean(item.storeOnly),
      // Presentaciones alternativas (p. ej. "CIEN" x 4) con su propio precio.
      measures: measures.map((m) => ({
        unit: m.unitMsr ?? null,
        itemsPerUnit: toNumber(m.itemsPerUnit),
        price: toNumber(m.price),
        listPrice: toNumber(m.lastPrice),
      })),
    },
    badges,
    // Sin raw: el payload ya esta repartido en columnas y pesa (0026).
  };
}

/**
 * Convierte el arbol de la API en categorias normalizadas. Los departamentos
 * no vienen como filas: se crean a partir de los `parent` distintos.
 */
export function mapLarachCategories(
  raw: LarachCategory[],
  webBaseUrl: string,
): { categories: NormalizedCategory[]; departmentByCategoryId: Map<string, string> } {
  const departments = new Map<string, NormalizedCategory>();
  const children: NormalizedCategory[] = [];
  const departmentByCategoryId = new Map<string, string>();

  for (const c of raw) {
    if (c?.id === undefined || c?.id === null || !c?.name) continue;
    const id = String(c.id);
    const parentId = c.parent?.id !== undefined && c.parent?.id !== null ? String(c.parent.id) : null;

    if (parentId && c.parent?.name && !departments.has(parentId)) {
      departments.set(parentId, {
        external_id: parentId,
        name: c.parent.name,
        external_parent_id: null,
        slug: larachSlug(c.parent.name),
        url: buildLarachCategoryUrl(c.parent.name, parentId, webBaseUrl),
        level: 1,
      });
    }
    if (parentId && c.parent?.name) departmentByCategoryId.set(id, c.parent.name);

    children.push({
      external_id: id,
      name: c.name,
      external_parent_id: parentId,
      slug: larachSlug(c.name),
      url: buildLarachCategoryUrl(c.name, id, webBaseUrl),
      level: parentId ? 2 : 1,
      position: toNumber(c.position),
    });
  }

  return { categories: [...departments.values(), ...children], departmentByCategoryId };
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): LarachConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  const pageSize = Number(raw.pageSize);

  return {
    apiBaseUrl: str('apiBaseUrl', DEFAULTS.apiBaseUrl).replace(/\/+$/, ''),
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl),
    mediaBaseUrl: str('mediaBaseUrl', DEFAULTS.mediaBaseUrl),
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 2000) : DEFAULTS.pageSize,
    category: str('category', DEFAULTS.category),
    syncCategories: raw.syncCategories !== false,
  };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const larachStrategy: ScrapeStrategy = {
  key: 'larach',
  label: 'Larach y Cia (API JSON)',
  supports: ['full_catalog', 'category'],
  configSchema: [
    {
      key: 'category',
      label: 'Id de departamento',
      example: '3',
      description:
        'Id numerico del departamento en larachycia.com (3 = Electricidad). Vacio = catalogo completo (26k articulos, no cabe en una corrida).',
    },
    {
      key: 'pageSize',
      label: 'Articulos por peticion',
      example: '1000',
      description: 'La API no impone tope; 1000 tarda ~5 s por pagina.',
    },
    {
      key: 'syncCategories',
      label: 'Sincronizar categorias',
      example: 'true',
      description: 'Pide el arbol de categorias junto con la primera pagina.',
    },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];

    const products: NormalizedProduct[] = [];
    const seen = new Set<string>();
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    let categories: NormalizedCategory[] | undefined;
    let departmentByCategoryId = new Map<string, string>();
    let page = 1;
    let pagesFetched = 0;
    let totalReported: number | undefined;

    while (pagesFetched < maxPages) {
      if (ctx.signal.aborted) {
        errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo' });
        break;
      }

      const body: Record<string, unknown> = {
        // orderBy fijo por codigo: un orden estable evita repetir o saltar
        // articulos entre paginas cuando la tienda edita nombres a mitad del barrido.
        paginate: { page, pageSize: config.pageSize, records: 0, orderBy: 'itemCode ASC' },
      };
      if (config.category) body.category = config.category;
      // El arbol viene en la misma respuesta: se pide solo con la primera pagina.
      if (config.syncCategories && page === 1) body['get-categories'] = true;

      let response: LarachPage;
      try {
        response = await ctx.http.postJson<LarachPage>(`${config.apiBaseUrl}/items`, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ stage: 'paginate', message, meta: { page, pageSize: config.pageSize } });
        ctx.log('error', `Fallo la pagina ${page}: ${message}`);
        break;
      }

      pagesFetched += 1;
      totalReported = toNumber(response.paginate?.records) ?? totalReported;

      if (page === 1 && Array.isArray(response.categories)) {
        const mapped = mapLarachCategories(response.categories, config.webBaseUrl);
        categories = mapped.categories;
        departmentByCategoryId = mapped.departmentByCategoryId;
        ctx.log('info', `Categorias sincronizadas: ${categories.length}`);
      }

      const batch = Array.isArray(response.data) ? response.data : [];
      if (batch.length === 0) break;

      for (const item of batch) {
        const mapped = mapLarachItem(item, config, currency, departmentByCategoryId);
        if (mapped && !seen.has(mapped.external_id)) {
          seen.add(mapped.external_id);
          products.push(mapped);
        }
      }

      page += 1;
      if (batch.length < config.pageSize) break;
      if (totalReported !== undefined && (page - 1) * config.pageSize >= totalReported) break;
    }

    if (totalReported !== undefined && products.length < totalReported) {
      ctx.log('warn', `Se obtuvieron ${products.length} de ${totalReported} articulos que reporta la tienda`);
      // En un full_catalog un barrido incompleto daria de baja articulos vivos:
      // el runner se salta el delisting cuando hay errores.
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
      stats: { category: config.category || 'todos', pageSize: config.pageSize, totalReported },
    };
  },
};
