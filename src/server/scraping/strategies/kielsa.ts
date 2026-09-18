import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedProduct,
  ScrapeContext,
  ScrapeResult,
  ScrapeStrategy,
} from '../types';
import { DdpClient, type DdpDoc } from '../ddp';
import { stripHtml, toNumber, truncate } from './ladylee';

/**
 * Estrategia para Farmacias Kielsa (https://kielsa.com), farmacia, sobre
 * Meteor: el html es un cascaron y TODO el catalogo viaja por DDP (WebSocket).
 *
 * ---------------------------------------------------------------------------
 * Reconocimiento (2026-09-18)
 * ---------------------------------------------------------------------------
 *   - https://kielsa.com/ pesa 5.7 KB y no trae ni un producto. Es Meteor 3.5
 *     (`__meteor_runtime_config__`). El "buscador" http
 *     (https://buscador.kielsa.com:8080/buscar/?product=...) devuelve solo ids
 *     de Mongo y categorias: no sirve solo.
 *   - Los productos se publican por DDP en `wss://kielsa.com/websocket`:
 *       sub "ProductFake.category" [{ sort, category, productName, page,
 *                                     pageSize, nonCategories, productos }]
 *     con `productName: "no-one"` devuelve el catalogo visible entero
 *     (`Desplegar_Web: 1`), 6 860 articulos el dia del reconocimiento, con
 *     158 campos por documento. El campo `category` NO filtra en el servidor
 *     (el cliente filtra despues), asi que un solo barrido cubre todo.
 *   - Paginacion con trampa: `skip = page * pageSize`, pero si
 *     `skip + pageSize` supera el total, el servidor devuelve CERO documentos
 *     en vez del resto (size 6859 -> 6859; size 6861 -> 0; page 686 de 10 ->
 *     0). Por eso el barrido baja de tamano al chocar con el final: 500, 100,
 *     10, 1. Cuesta ~20 suscripciones extra y no pierde ningun articulo.
 *   - Rendimiento medido: ~200 documentos/s (6 500 en ~33 s). El catalogo
 *     entero cabe en una corrida.
 *   - Campos usados: `Articulo_Id` (SKU, estable) como external_id, el `_id`
 *     de Mongo para la url publica /productDetail/{_id}, `Precio` (lista) y
 *     `Precio_con_Descuento` (vigente, con `Descuento` en %), `AxB_Existencia`
 *     (existencia de la tienda web), `Categoria_Web` / `Sub_Categoria_Web` /
 *     `Sub_Categoria2_Web` (arbol; "NULL" literal cuando no hay),
 *     `Casa_Nombre` (laboratorio), `Principal_Activo`, `Tipo_Articulo_Nombre`
 *     (Controlado / No Controlado / Natural), `Articulo_Descripcion_Completa`
 *     (html codificado con encodeURIComponent) e `imageProduct`.
 *   - `imageProduct` es una url de S3 en el 90 % de los casos y un data URI
 *     base64 en el resto (~700): esos se dejan sin imagen, no se guardan
 *     kilobytes de base64 por articulo.
 *   - Los precios vienen como float de Python sin redondear
 *     (747.5645782199999): se redondean a centavos.
 *   - Campos volatiles que NO se copian: existencias por zona (Zona1..42),
 *     `ABC_Valor` / `ABC_Und_Vta` (ranking de ventas), `nameToSearch`.
 */

interface KielsaConfig {
  webBaseUrl: string;
  ddpUrl: string;
  /** Tamano de la primera pasada; multiplo de 100. */
  pageSize: number;
  /** Pausa entre suscripciones, ms. */
  delayMs: number;
}

const DEFAULTS: KielsaConfig = {
  webBaseUrl: 'https://kielsa.com',
  ddpUrl: 'wss://kielsa.com/websocket',
  pageSize: 500,
  delayMs: 300,
};

/** Escalera de tamanos al chocar con el final; cada uno divide al anterior. */
const TAIL_SIZES = [100, 10, 1];
const MAX_PAGES_HARD_LIMIT = 200;
const MAX_DESCRIPTION_CHARS = 2000;

export interface KielsaDoc {
  _id: string;
  Articulo_Id?: string;
  Articulo_Nombre?: string;
  Tipo_Articulo_Nombre?: string;
  AxB_Existencia?: number;
  Precio?: number;
  Descuento?: number;
  Precio_con_Descuento?: number;
  Articulo_Descripcion_Completa?: string;
  Principal_Activo?: string;
  Marca_Propia?: number;
  Porcentaje_ISV?: number;
  Casa_Nombre?: string;
  Laboratorio?: string;
  Categoria_Web?: string;
  Sub_Categoria_Web?: string;
  Sub_Categoria2_Web?: string;
  Activo_Web?: number;
  Desplegar_Web?: number;
  Requiere_Requisitos?: string;
  imageProduct?: string;
  Imagen_Path?: string;
}

// -----------------------------------------------------------------------------
// Utilidades de normalizacion (exportadas para probarlas sin red)
// -----------------------------------------------------------------------------

function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

/** "Mundo de Bebé" -> "mundo-de-bebe". */
export function kielsaSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Valor de categoria limpio; Kielsa escribe "NULL" y "" cuando no hay. */
function categoryValue(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  return text && text.toUpperCase() !== 'NULL' ? text : null;
}

/** Nombres de la rama del articulo, de la raiz a la hoja. */
export function kielsaCategoryPath(doc: Pick<KielsaDoc, 'Categoria_Web' | 'Sub_Categoria_Web' | 'Sub_Categoria2_Web'>): string[] {
  const path: string[] = [];
  for (const value of [doc.Categoria_Web, doc.Sub_Categoria_Web, doc.Sub_Categoria2_Web]) {
    const name = categoryValue(value);
    if (!name) break;
    path.push(name);
  }
  return path;
}

/** Id estable de una categoria: la ruta completa en slug ("medicamentos/antibioticos"). */
export function kielsaCategoryId(path: string[]): string {
  return path.map(kielsaSlug).join('/');
}

/**
 * La descripcion viene como html pasado por encodeURIComponent
 * ("%3Cp%3ERequisitos..."). Se decodifica y se deja solo el texto.
 */
export function decodeKielsaDescription(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // No estaba codificada: se usa tal cual.
  }
  const text = stripHtml(decoded);
  return text ? truncate(text, MAX_DESCRIPTION_CHARS) : null;
}

function toAvailability(stock: number | null): AvailabilityStatus {
  if (stock === null) return 'unknown';
  if (stock <= 0) return 'out_of_stock';
  if (stock <= 3) return 'limited';
  return 'in_stock';
}

/** Traduce un documento de la publicacion al contrato comun del sistema. */
export function mapKielsaDoc(doc: KielsaDoc, webBaseUrl: string, currency: string): NormalizedProduct | null {
  const sku = (doc.Articulo_Id ?? '').trim();
  const name = (doc.Articulo_Nombre ?? '').trim();
  if (!sku || !name || !doc._id) return null;
  const base = webBaseUrl.replace(/\/+$/, '');

  const listPriceRaw = round2(toNumber(doc.Precio));
  const currentRaw = round2(toNumber(doc.Precio_con_Descuento));
  // Sin descuento los dos campos traen el mismo numero; el vigente es
  // Precio_con_Descuento y Precio solo cuenta como "antes" si es mayor.
  const price = currentRaw !== null && currentRaw > 0 ? currentRaw : listPriceRaw !== null && listPriceRaw > 0 ? listPriceRaw : null;
  const listPrice = listPriceRaw !== null && price !== null && listPriceRaw > price ? listPriceRaw : null;
  const discountPercent = listPrice !== null ? round2(toNumber(doc.Descuento)) : null;

  const stock = toNumber(doc.AxB_Existencia);
  const image = typeof doc.imageProduct === 'string' && /^https?:\/\//.test(doc.imageProduct) ? doc.imageProduct : null;
  const path = kielsaCategoryPath(doc);
  const kind = (doc.Tipo_Articulo_Nombre ?? '').trim();

  const badges: string[] = [];
  if (listPrice !== null) badges.push('descuento');
  if (kind === 'Controlado') badges.push('controlado');
  if (kind === 'Natural') badges.push('natural');
  if (doc.Marca_Propia === 1) badges.push('marca-propia');
  if ((doc.Requiere_Requisitos ?? '').trim() === 'Si') badges.push('requiere-receta');

  return {
    // Identidad: Articulo_Id es el SKU del ERP (10 digitos) y es estable; el
    // _id de Mongo se guarda aparte porque es lo que usa la url publica.
    external_id: sku,
    sku,
    name,
    url: `${base}/productDetail/${doc._id}`,
    condition: 'new',

    // Contenido
    description: decodeKielsaDescription(doc.Articulo_Descripcion_Completa),
    brand_raw: (doc.Laboratorio ?? '').trim() || (doc.Casa_Nombre ?? '').trim() || null,
    manufacturer: (doc.Casa_Nombre ?? '').trim() || null,

    // Clasificacion: el arbol se deriva de los propios documentos.
    store_category_external_id: path.length ? kielsaCategoryId(path) : null,
    category_raw: path[path.length - 1] ?? null,
    category_path: path,
    tags: kind ? [kind] : [],

    // Precio
    currency,
    price,
    list_price: listPrice,
    discount_percent: discountPercent && discountPercent > 0 ? discountPercent : null,
    discount_amount: listPrice !== null && price !== null ? round2(listPrice - price) : null,
    tax_rate: toNumber(doc.Porcentaje_ISV),
    tax_included: true,

    // Disponibilidad: existencia de la bodega que despacha la web.
    availability: toAvailability(stock),
    in_stock: stock === null ? null : stock > 0,
    stock_quantity: stock,

    // Medios
    primary_image_url: image,
    images: image ? [{ url: image, position: 0, is_primary: true, alt_text: name }] : [],

    // Datos libres
    attributes: {
      mongoId: doc._id,
      activeIngredient: (doc.Principal_Activo ?? '').trim() || null,
      kind: kind || null,
      requiresPrescription: (doc.Requiere_Requisitos ?? '').trim() || null,
      activeWeb: doc.Activo_Web === 1,
    },
    badges,
  };
}

/** Arbol de categorias a partir de las rutas vistas en los articulos. */
export function collectKielsaCategories(paths: string[][], webBaseUrl: string): NormalizedCategory[] {
  const base = webBaseUrl.replace(/\/+$/, '');
  const byId = new Map<string, NormalizedCategory>();
  const counts = new Map<string, number>();
  for (const path of paths) {
    for (let level = 1; level <= path.length; level += 1) {
      const branch = path.slice(0, level);
      const id = kielsaCategoryId(branch);
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (byId.has(id)) continue;
      byId.set(id, {
        external_id: id,
        name: branch[level - 1],
        external_parent_id: level > 1 ? kielsaCategoryId(branch.slice(0, level - 1)) : null,
        slug: kielsaSlug(branch[level - 1]),
        // Solo la raiz tiene una ruta propia en el sitio (/searchproducts/{pagina}/{categoria}/no-one).
        url: level === 1 ? `${base}/searchproducts/1/${encodeURIComponent(branch[0])}/no-one` : null,
        level,
      });
    }
  }
  return [...byId.values()].map((c) => ({ ...c, product_count: counts.get(c.external_id) ?? null }));
}

// -----------------------------------------------------------------------------
// Lectura de configuracion
// -----------------------------------------------------------------------------

function readConfig(raw: Record<string, unknown>): KielsaConfig {
  const str = (key: string, fallback: string) => {
    const value = raw[key];
    return typeof value === 'string' && value.length > 0 ? value : fallback;
  };
  const pageSize = Number(raw.pageSize);
  const delayMs = Number(raw.delayMs);
  return {
    webBaseUrl: str('webBaseUrl', DEFAULTS.webBaseUrl).replace(/\/+$/, ''),
    ddpUrl: str('ddpUrl', DEFAULTS.ddpUrl),
    // Multiplo de 100 y como maximo 2000: la escalera de cola (100, 10, 1)
    // necesita que cada tamano divida al anterior.
    pageSize: Number.isFinite(pageSize) && pageSize >= 100 ? Math.min(Math.floor(pageSize / 100) * 100, 2000) : DEFAULTS.pageSize,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : DEFAULTS.delayMs,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

export const kielsaStrategy: ScrapeStrategy = {
  key: 'kielsa',
  label: 'Farmacias Kielsa (Meteor DDP)',
  supports: ['full_catalog'],
  configSchema: [
    { key: 'pageSize', label: 'Articulos por suscripcion', example: '500', description: 'Multiplo de 100, maximo 2000. ~200 articulos/s.' },
    { key: 'delayMs', label: 'Pausa entre suscripciones (ms)', example: '300' },
    { key: 'ddpUrl', label: 'WebSocket DDP', example: 'wss://kielsa.com/websocket' },
  ],

  async run(ctx: ScrapeContext): Promise<ScrapeResult> {
    const config = readConfig(ctx.config);
    const currency = ctx.store.default_currency || 'HNL';
    const errors: NonNullable<ScrapeResult['errors']> = [];
    const maxPages = Math.min(ctx.target.max_pages ?? MAX_PAGES_HARD_LIMIT, MAX_PAGES_HARD_LIMIT);

    const products: NormalizedProduct[] = [];
    const seen = new Set<string>();
    const paths: string[][] = [];
    let pagesFetched = 0;
    let complete = false;

    const client = new DdpClient(config.ddpUrl);
    try {
      await client.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ stage: 'connect', message });
      ctx.log('error', message);
      return { products, pagesFetched, errors };
    }

    try {
      let offset = 0;
      const sizes = [config.pageSize, ...TAIL_SIZES];
      let sizeIndex = 0;

      while (pagesFetched < maxPages) {
        if (ctx.signal.aborted) {
          errors.push({ stage: 'paginate', message: 'Corrida abortada por limite de tiempo', meta: { offset } });
          break;
        }
        const size = sizes[sizeIndex];
        const page = offset / size;
        let docs: DdpDoc[];
        try {
          docs = await client.subscribe(
            'ProductFake.category',
            [{ sort: { ABC_Valor: -1 }, category: 'no-one', productName: 'no-one', page, pageSize: size, nonCategories: [], productos: [] }],
            { signal: ctx.signal },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ stage: 'paginate', message, meta: { offset, size } });
          ctx.log('error', `Fallo la suscripcion en ${offset} (x${size}): ${message}`);
          break;
        }
        pagesFetched += 1;

        if (docs.length === 0) {
          // Choco con el final: el servidor no devuelve el resto, devuelve
          // nada. Se baja de tamano y se reintenta desde el mismo offset.
          if (sizeIndex === sizes.length - 1) {
            complete = true;
            break;
          }
          sizeIndex += 1;
          continue;
        }

        for (const doc of docs) {
          const mapped = mapKielsaDoc({ _id: doc.id, ...(doc.fields as Omit<KielsaDoc, '_id'>) }, config.webBaseUrl, currency);
          if (mapped && !seen.has(mapped.external_id)) {
            seen.add(mapped.external_id);
            products.push(mapped);
            if (mapped.category_path?.length) paths.push(mapped.category_path);
          }
        }
        offset += docs.length;
        // Una pagina corta tambien es el final (por si el servidor cambia).
        if (docs.length < size) {
          complete = true;
          break;
        }
        if (config.delayMs > 0) await sleep(config.delayMs);
      }
    } finally {
      client.close();
    }

    if (!complete && errors.length === 0) {
      errors.push({ stage: 'paginate', message: `Tope de ${maxPages} suscripciones alcanzado con ${products.length} articulos` });
    }
    if (!complete) ctx.log('warn', `Barrido incompleto: ${products.length} articulos en ${pagesFetched} suscripciones`);

    return {
      products,
      categories: collectKielsaCategories(paths, config.webBaseUrl),
      pagesFetched,
      errors,
      stats: { pageSize: config.pageSize, complete, subscriptions: pagesFetched },
    };
  },
};
