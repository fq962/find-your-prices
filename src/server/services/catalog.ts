import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';
import type { AvailabilityStatus } from '@/server/scraping/types';
import type { Product } from '@/types';
import {
  buildCategoryTree,
  UNCATEGORIZED_VALUE,
  type CanonicalCategoryFacetRow,
  type FacetOption,
} from '@/features/products/categoryFacets';

/**
 * Lectura del catálogo público.
 *
 * Lee de `v_store_products_current`, que ya trae tienda, marca y categoría
 * resueltas. La vista filtra por `is_active`, así que lo que sale de acá es
 * siempre oferta viva.
 *
 * Punto importante de diseño: el catálogo son miles de artículos y no se
 * mandan todos al navegador. La página sirve un primer lote curado y tanto la
 * búsqueda como los filtros se resuelven en Postgres.
 */

/** Fila cruda de la vista de listado. */
interface CatalogRow {
  id: string;
  public_slug: string | null;
  store_slug: string;
  store_name: string;
  name: string;
  url: string | null;
  primary_image_url: string | null;
  brand: string | null;
  category_raw: string | null;
  store_category_name: string | null;
  /** Nodo canónico de `categories`, si el mapeo ya existe (migración 0024). */
  category_slug?: string | null;
  category_name?: string | null;
  currency: string;
  price: number | null;
  list_price: number | null;
  discount_percent: number | null;
  availability: AvailabilityStatus;
  in_stock: boolean | null;
  rating_average: number | null;
  rating_count: number | null;
}

const VIEW = 'v_store_products_current';

/**
 * Estados de disponibilidad que sacan un artículo del catálogo por defecto.
 *
 * `out_of_stock` y `discontinued` son las dos formas explícitas de "no lo podés
 * comprar". `unknown` NO está en la lista, y es deliberado: cuando el scraper
 * no logró determinar la existencia, esconder el artículo sería tratar un vacío
 * de información como una respuesta negativa. En Diunsa eso solo dejaría fuera
 * miles de artículos que sí están a la venta.
 */
const UNAVAILABLE_STATES = ['out_of_stock', 'discontinued'] as const;

/**
 * El piso de "esto se puede comprar hoy" que se aplica salvo que alguien pida
 * lo contrario: precio real —mayor que cero— y disponibilidad que no sea una
 * negativa explícita.
 *
 * Vive en una función y no repetido en cada consulta porque lo usan el listado,
 * el conteo y el cálculo de facetas de respaldo. Si las tres no filtran igual,
 * el selector ofrece "Televisores (120)" y la búsqueda devuelve 90.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAvailabilityFloor(request: any): any {
  return request
    .gt('price', 0)
    .not('availability', 'in', `("${UNAVAILABLE_STATES.join('","')}")`);
}
const BASE_COLUMNS =
  'id, store_slug, store_name, name, url, primary_image_url, brand, category_raw, ' +
  'store_category_name, currency, price, list_price, discount_percent, availability, ' +
  'in_stock, rating_average, rating_count';

/**
 * El slug de la URL pública, que agrega la migración 0021.
 *
 * Se pide aparte porque el catálogo tiene que seguir en pie si el código se
 * despliega antes de correr la migración. Sin esta separación, pedir una
 * columna que la vista todavía no publica hace fallar la consulta ENTERA —no
 * devuelve la fila sin ese campo, devuelve error 42703— y la portada, que es
 * casi todo el sitio, saldría vacía. Es el mismo cuidado que ya se tenía con
 * `first_seen_at`.
 */
const SLUG_COLUMN = 'public_slug';

/**
 * Si la vista ya publica el slug.
 *
 * Vive en el módulo y no en cada llamada a propósito: una vez comprobado que
 * la columna falta, el resto de las consultas del proceso ya no la piden y no
 * se paga un viaje fallido por visita. Vuelve a intentarlo en el siguiente
 * arranque, que es cuando puede haber cambiado.
 */
let slugColumnPublished = true;

/**
 * Nombre de la categoría canónica, que agrega la migración 0024.
 *
 * Mismo cuidado que con `public_slug`: si la vista aún no la publica, se deja
 * de pedir y el catálogo sigue mostrando la categoría de la tienda.
 */
const CATEGORY_COLUMNS = 'category_slug, category_name';
const CATEGORY_NAME_COLUMN = 'category_name';
let categoryColumnsPublished = true;

/**
 * Columna con la fecha en que el artículo apareció por primera vez.
 *
 * La agrega la migración 0017 a `v_store_products_current`. Antes de aplicarla
 * la vista no la expone y ordenar por ella devuelve error 42703; por eso
 * `searchCatalog` reintenta con `last_seen_at`, que está en la vista desde el
 * principio. Así "Recién agregados" degrada a "visto hace poco" en vez de
 * dejar la home en blanco mientras la migración no corre.
 */
const NEWEST_COLUMN = 'first_seen_at';

/** Etiquetas de disponibilidad por idioma. El componente solo pinta el texto. */
const AVAILABILITY_LABELS: Record<'es' | 'en', Partial<Record<AvailabilityStatus, string>>> = {
  es: {
    in_stock: 'Disponible',
    limited: 'Últimas unidades',
    out_of_stock: 'Agotado',
    preorder: 'Preventa',
    backorder: 'Bajo pedido',
    discontinued: 'Descontinuado',
  },
  en: {
    in_stock: 'In stock',
    limited: 'Low stock',
    out_of_stock: 'Out of stock',
    preorder: 'Preorder',
    backorder: 'Backorder',
    discontinued: 'Discontinued',
  },
};

export type CatalogLocale = 'es' | 'en';

function toProduct(row: CatalogRow, locale: CatalogLocale): Product {
  return {
    id: row.id,
    slug: row.public_slug ?? undefined,
    name: row.name,
    price: row.price ?? 0,
    currency: row.currency,
    store: row.store_name,
    storeSlug: row.store_slug,
    // Primero la canónica (árbol propio de `categories`): es lo que el filtro
    // ofrece, así que la tarjeta tiene que decir lo mismo. Sin mapeo aún, la
    // de la tienda, que es más específica que la cruda.
    category:
      row.category_name ?? row.store_category_name ?? row.category_raw ?? 'Sin categoría',
    categorySlug: row.category_slug ?? undefined,
    imageUrl: row.primary_image_url ?? undefined,
    availability: AVAILABILITY_LABELS[locale][row.availability],
    // La marca es el subtítulo natural: los nombres de Diunsa vienen truncados
    // a 40 caracteres y una descripción larga no aporta en una fila de lista.
    description: row.brand ?? undefined,
    url: row.url ?? undefined,
    brand: row.brand ?? undefined,
    listPrice: row.list_price ?? undefined,
    discountPercent: row.discount_percent ?? undefined,
    inStock: row.in_stock ?? undefined,
    ratingAverage: row.rating_average ?? undefined,
    ratingCount: row.rating_count ?? undefined,
  };
}

// -----------------------------------------------------------------------------
// Facetas
// -----------------------------------------------------------------------------

export type { FacetOption };

export interface CatalogFacets {
  /**
   * Árbol de categorías canónicas: raíces con sus hijas, y al final la opción
   * `UNCATEGORIZED_VALUE` si hay artículos sin mapeo. Ver `categoryFacets.ts`.
   */
  categories: FacetOption[];
  stores: FacetOption[];
  brands: FacetOption[];
  minPrice: number;
  maxPrice: number;
  totalProducts: number;
  totalStores: number;
  totalCategories: number;
  discountedProducts: number;
}

const EMPTY_FACETS: CatalogFacets = {
  categories: [],
  stores: [],
  brands: [],
  minPrice: 0,
  maxPrice: 0,
  totalProducts: 0,
  totalStores: 0,
  totalCategories: 0,
  discountedProducts: 0,
};

/**
 * Opciones de filtro que de verdad devuelven algo.
 *
 * Se derivan de los productos existentes, NO de la tabla de categorías
 * entera. La diferencia no es cosmética: un árbol tiene nodos que nunca
 * reciben productos, y armar el selector con todos ofrecía decenas de
 * categorías que devolvían cero resultados.
 *
 * Las categorías son las canónicas (`categories`, el árbol propio del sitio),
 * no las de cada tienda: "Juguetes", "Juguetería" y "Juguetes para jugar" son
 * una sola opción. Lo que aún no tiene mapeo cae en "Sin categorizar aún".
 */
export async function getCatalogFacets(): Promise<CatalogFacets> {
  try {
    const db = getSupabaseAdmin();

    const [categories, stores, brands, summary] = await Promise.all([
      db
        .from('v_catalog_canonical_category_facets')
        .select('slug, name, parent_slug, parent_name, product_count'),
      db.from('v_catalog_store_facets').select('store_name, product_count'),
      db
        .from('v_catalog_brand_facets')
        .select('brand_name, product_count')
        .order('product_count', { ascending: false })
        .limit(300),
      db.from('v_catalog_summary').select('*').single(),
    ]);

    // Si las vistas de faceta no existen todavía (migración 0013 sin aplicar),
    // se calcula igual, aunque más lento. Nunca se cae al árbol de la tienda:
    // ese era justamente el bug.
    if (categories.error || stores.error || summary.error) {
      return await computeFacetsByScan();
    }

    const toOptions = (rows: unknown[], key: string): FacetOption[] =>
      (rows as Record<string, unknown>[])
        .map((row) => ({ value: String(row[key] ?? ''), count: Number(row.product_count ?? 0) }))
        .filter((option) => option.value !== '' && option.count > 0)
        .sort((a, b) => b.count - a.count);

    const totals = summary.data as Record<string, number>;

    return {
      categories: buildCategoryTree(toCategoryRows(categories.data ?? [])),
      stores: toOptions(stores.data ?? [], 'store_name'),
      brands: brands.error ? [] : toOptions(brands.data ?? [], 'brand_name'),
      minPrice: Number(totals.min_price ?? 0),
      maxPrice: Number(totals.max_price ?? 0),
      totalProducts: Number(totals.total_products ?? 0),
      totalStores: Number(totals.total_stores ?? 0),
      totalCategories: Number(totals.total_categories ?? 0),
      discountedProducts: Number(totals.discounted_products ?? 0),
    };
  } catch {
    return EMPTY_FACETS;
  }
}

/**
 * Cálculo de facetas sin las vistas de la migración 0013.
 *
 * PostgREST devuelve como mucho 1000 filas por petición, así que se recorre por
 * páginas pidiendo solo las columnas necesarias. Es correcto pero cuesta varios
 * viajes; con la migración aplicada este camino no se usa. Solo corre durante
 * la revalidación de la página (cada 5 minutos), nunca por visitante.
 */
async function computeFacetsByScan(): Promise<CatalogFacets> {
  const db = getSupabaseAdmin();
  const PAGE = 1000;
  const MAX_PAGES = 40; // tope de seguridad: 40 000 artículos

  const categoryCounts = new Map<string, CanonicalCategoryFacetRow>();
  const storeCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let total = 0;
  let discounted = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Mismo piso de disponibilidad que el listado: estas cuentas alimentan los
    // selectores, y un selector que promete más de lo que la búsqueda devuelve
    // parece un fallo del sitio, no un filtro.
    const { data, error } = await applyAvailabilityFloor(
      db
        .from(VIEW)
        .select(
          'category_slug, category_name, category_root_slug, category_root_name, store_name, brand, price, list_price',
        )
        .not('price', 'is', null),
    ).range(page * PAGE, page * PAGE + PAGE - 1);

    if (error) break;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    for (const row of rows) {
      total += 1;
      const price = Number(row.price);
      if (Number.isFinite(price)) {
        if (price < min) min = price;
        if (price > max) max = price;
      }
      if (row.list_price !== null) discounted += 1;

      const bump = (map: Map<string, number>, value: unknown) => {
        const key = typeof value === 'string' ? value.trim() : '';
        if (key) map.set(key, (map.get(key) ?? 0) + 1);
      };
      bumpCategory(categoryCounts, row);
      bump(storeCounts, row.store_name);
      bump(brandCounts, row.brand);
    }

    if (rows.length < PAGE) break;
  }

  const toOptions = (map: Map<string, number>, minCount = 1): FacetOption[] =>
    [...map.entries()]
      .filter(([, count]) => count >= minCount)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

  const categories = buildCategoryTree([...categoryCounts.values()]);
  return {
    categories,
    stores: toOptions(storeCounts),
    brands: toOptions(brandCounts, 2).slice(0, 300),
    minPrice: Number.isFinite(min) ? min : 0,
    maxPrice: max,
    totalProducts: total,
    totalStores: storeCounts.size,
    totalCategories: categories.filter((option) => option.value !== UNCATEGORIZED_VALUE).length,
    discountedProducts: discounted,
  };
}

/** Filas de `v_catalog_canonical_category_facets` con tipos ya fijados. */
function toCategoryRows(rows: unknown[]): CanonicalCategoryFacetRow[] {
  return (rows as Record<string, unknown>[]).map((row) => ({
    slug: (row.slug as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    parentSlug: (row.parent_slug as string | null) ?? null,
    parentName: (row.parent_name as string | null) ?? null,
    count: Number(row.product_count ?? 0),
  }));
}

/**
 * Acumula un artículo en su nodo canónico, para el camino sin vistas.
 *
 * La vista trae la raíz ya resuelta (`category_root_*`); acá se traduce a la
 * forma padre/hija que espera `buildCategoryTree`: si la raíz es el mismo
 * nodo, no hay padre.
 */
function bumpCategory(map: Map<string, CanonicalCategoryFacetRow>, row: Record<string, unknown>) {
  const slug = typeof row.category_slug === 'string' ? row.category_slug : null;
  const rootSlug = typeof row.category_root_slug === 'string' ? row.category_root_slug : null;
  const key = slug ?? '';
  const current = map.get(key);
  if (current) {
    current.count += 1;
    return;
  }
  const isChild = slug !== null && rootSlug !== null && rootSlug !== slug;
  map.set(key, {
    slug,
    name: typeof row.category_name === 'string' ? row.category_name : null,
    parentSlug: isChild ? rootSlug : null,
    parentName: isChild && typeof row.category_root_name === 'string' ? row.category_root_name : null,
    count: 1,
  });
}

// -----------------------------------------------------------------------------
// Listado y búsqueda
// -----------------------------------------------------------------------------

export type CatalogSort =
  | 'newest'
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'discount'
  | 'name-asc'
  | 'rating';

export interface SearchCatalogParams {
  query?: string;
  /**
   * Un valor o varios. Varios se resuelven con `in (...)`, así que las
   * casillas del panel pueden prometer "marcá varias" sin mentir. Vacío o
   * `undefined` es "sin filtro".
   */
  store?: string | string[];
  /**
   * Slugs de `categories`. Una raíz abarca a sus hijas. `UNCATEGORIZED_VALUE`
   * pide lo que aún no tiene mapeo canónico.
   */
  category?: string | string[];
  /** Nombre de la categoría de la tienda, tal cual. Lo usan los relacionados. */
  storeCategory?: string | string[];
  brand?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  onlyDiscounted?: boolean;
  /**
   * Traer también lo que no se puede comprar hoy: agotados, descontinuados y
   * artículos con precio 0.
   *
   * El default es `false`, y esa es la decisión de producto: un comparador de
   * precios que abre mostrando cosas agotadas o a "L 0.00" está gastando la
   * primera pantalla —la única que casi todo el mundo mira— en resultados que
   * no responden la pregunta que trajo a la persona. Un precio 0 además no es
   * una ganga: es un dato que la tienda no publicó y que el scraper anotó como
   * cero.
   *
   * Se puede desactivar, y por eso existe la bandera en vez de un filtro
   * cableado: quien está siguiendo un artículo agotado para saber cuándo vuelve
   * tiene un motivo legítimo para verlo. Pero lo tiene que pedir.
   */
  includeUnavailable?: boolean;
  sort?: CatalogSort;
  limit?: number;
  offset?: number;
  locale?: CatalogLocale;
}

export interface SearchCatalogResult {
  products: Product[];
  /** Total que cumple los filtros, no solo lo devuelto en esta página. */
  total: number;
}

/**
 * Búsqueda y filtrado sobre el catálogo completo, resuelto en Postgres.
 *
 * Es lo que hace honesta a la caja de búsqueda: filtrar en el navegador solo
 * encontraría entre los artículos ya servidos, y el usuario creería que el
 * resto no existe.
 */
export async function searchCatalog(params: SearchCatalogParams): Promise<SearchCatalogResult> {
  // Hasta cuatro pasadas: la buena, y una por cada columna que la vista pueda
  // no tener todavía. Cada reintento apaga exactamente lo que faltó, así que
  // el catálogo degrada por partes —sin orden por novedad, sin enlace a la
  // ficha, o sin categoría canónica— en vez de caerse entero.
  let newestColumn = NEWEST_COLUMN;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const published = `${slugColumnPublished}${categoryColumnsPublished}`;
    const result = await runCatalogQuery(params, newestColumn);
    if (result !== null) return result;

    // `null` significa "falta una columna". Cuál, lo dice la bandera que la
    // propia consulta acaba de bajar; si ninguna bajó, fue la de novedad.
    if (published !== `${slugColumnPublished}${categoryColumnsPublished}`) continue;
    newestColumn = 'last_seen_at';
  }

  return { products: [], total: 0 };
}

/**
 * Filtra una columna por uno o varios valores. Con uno usa `eq`, con varios
 * `in`; sin ninguno deja la consulta como estaba.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFacet(request: any, column: string, value: string | string[] | undefined): any {
  const values = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
  if (values.length === 0) return request;
  if (values.length === 1) return request.eq(column, values[0]);
  return request.in(column, values);
}

/**
 * Filtro por categoría canónica.
 *
 * Un slug entra por dos columnas: `category_slug` (el nodo exacto) y
 * `category_root_slug` (todo lo que cuelga de una raíz). Así marcar
 * "Juguetería y Juegos" trae también "Muñecas, Figuras y Vehículos" sin que
 * el cliente tenga que conocer el árbol. `UNCATEGORIZED_VALUE` es
 * `category_slug is null`: lo que aún no se mapeó.
 *
 * Se arma como una sola cláusula `or` de PostgREST; los slugs van entre
 * comillas por si alguno trajera coma.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyCategoryFacet(request: any, value: string | string[] | undefined): any {
  const values = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
  if (values.length === 0) return request;

  const slugs = values.filter((item) => item !== UNCATEGORIZED_VALUE);
  const clauses: string[] = [];
  if (slugs.length > 0) {
    const list = `(${slugs.map((slug) => `"${slug.replace(/"/g, '')}"`).join(',')})`;
    clauses.push(`category_slug.in.${list}`, `category_root_slug.in.${list}`);
  }
  if (slugs.length < values.length) clauses.push('category_slug.is.null');
  return request.or(clauses.join(','));
}

/**
 * Una pasada de la consulta. Devuelve `null` —y solo `null`— cuando falta una
 * columna que la vista no publica todavía, que es la única condición que vale
 * la pena reintentar.
 */
async function runCatalogQuery(
  params: SearchCatalogParams,
  newestColumn: string,
): Promise<SearchCatalogResult | null> {
  const limit = Math.min(params.limit ?? 60, 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const locale = params.locale ?? 'es';

  try {
    // El encadenado condicional de filtros sobre el builder tipado de
    // supabase-js dispara "Type instantiation is excessively deep": cada
    // .eq()/.gte() reescribe el tipo del resultado. Se afloja el tipo del
    // builder a propósito; la forma real de las filas se fija abajo, al
    // mapearlas a CatalogRow.
    const columns = [
      BASE_COLUMNS,
      slugColumnPublished ? SLUG_COLUMN : null,
      categoryColumnsPublished ? CATEGORY_COLUMNS : null,
    ]
      .filter(Boolean)
      .join(', ');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let request: any = getSupabaseAdmin()
      .from(VIEW)
      .select(columns, { count: 'exact' })
      .not('price', 'is', null);

    const query = params.query?.trim();
    if (query) {
      // ilike con comodines a ambos lados: busca la frase en cualquier parte
      // del nombre. Los % y _ del usuario se escapan para que no actúen como
      // comodines y devuelvan resultados que nadie pidió.
      const safe = query.replace(/[%_\\]/g, (char) => `\\${char}`);
      request = request.ilike('name', `%${safe}%`);
    }
    request = applyFacet(request, 'store_name', params.store);
    request = applyCategoryFacet(request, params.category);
    request = applyFacet(request, 'store_category_name', params.storeCategory);
    request = applyFacet(request, 'brand', params.brand);
    if (params.minPrice !== undefined) request = request.gte('price', params.minPrice);
    if (params.maxPrice !== undefined) request = request.lte('price', params.maxPrice);
    if (params.onlyDiscounted) request = request.not('list_price', 'is', null);
    if (!params.includeUnavailable) request = applyAvailabilityFloor(request);

    switch (params.sort) {
      // Lo más nuevo primero. `nullsFirst: false` deja al final lo que no tiene
      // fecha: un artículo sin registrar no es un artículo antiquísimo.
      case 'newest':
        request = request.order(newestColumn, { ascending: false, nullsFirst: false });
        break;
      case 'price-asc':
        request = request.order('price', { ascending: true });
        break;
      case 'price-desc':
        request = request.order('price', { ascending: false });
        break;
      case 'name-asc':
        request = request.order('name', { ascending: true });
        break;
      case 'rating':
        request = request.order('rating_average', { ascending: false, nullsFirst: false });
        break;
      case 'discount':
      default:
        request = request.order('discount_percent', { ascending: false, nullsFirst: false });
    }

    // Desempate estable: sin una segunda clave, dos páginas consecutivas pueden
    // repetir o saltarse artículos con el mismo descuento.
    request = request.order('id', { ascending: true });

    const { data, error, count } = await request.range(offset, offset + limit - 1);
    if (error) {
      // 42703 = undefined_column en Postgres. Es lo que responde PostgREST
      // cuando se pide o se ordena por una columna que la vista no publica.
      const message = String(error.message);
      const undefinedColumn = error.code === '42703';

      // El mensaje de PostgREST nombra la columna que falta
      // ("column ... public_slug does not exist"), que es lo que permite saber
      // cuál de las dos apagar.
      if (slugColumnPublished && message.includes(SLUG_COLUMN)) {
        slugColumnPublished = false;
        return null;
      }
      if (categoryColumnsPublished && message.includes(CATEGORY_NAME_COLUMN)) {
        categoryColumnsPublished = false;
        return null;
      }

      const missingNewest = undefinedColumn || message.includes(newestColumn);
      if (missingNewest && params.sort === 'newest') return null;
      throw new Error(error.message);
    }

    return {
      products: ((data ?? []) as unknown as CatalogRow[]).map((row) => toProduct(row, locale)),
      total: count ?? 0,
    };
  } catch {
    return { products: [], total: 0 };
  }
}

export interface CatalogSnapshot {
  products: Product[];
  facets: CatalogFacets;
  total: number;
}

const EMPTY_SNAPSHOT: CatalogSnapshot = {
  products: [],
  facets: EMPTY_FACETS,
  total: 0,
};

/**
 * Primer lote que ve el visitante, más las facetas.
 *
 * Se ordena por lo recién agregado, que es el mismo criterio por defecto del
 * selector de orden: el primer lote y lo que devuelve la primera búsqueda
 * tienen que estar ordenados igual, o cambiar de opinión sobre el orden
 * parecería un fallo.
 */
export async function getCatalogSnapshot(options?: {
  limit?: number;
  locale?: CatalogLocale;
}): Promise<CatalogSnapshot> {
  try {
    const [listing, facets] = await Promise.all([
      searchCatalog({
        sort: 'newest',
        limit: options?.limit ?? 90,
        locale: options?.locale ?? 'es',
      }),
      getCatalogFacets(),
    ]);

    return { products: listing.products, facets, total: listing.total };
  } catch {
    // Sin base (migraciones sin correr, red caída) la home no debe romperse:
    // la vista decide qué mostrar con un catálogo vacío.
    return EMPTY_SNAPSHOT;
  }
}

// -----------------------------------------------------------------------------
// Ficha de producto
// -----------------------------------------------------------------------------

export interface ProductImage {
  url: string;
  position: number;
  isPrimary: boolean;
  altText?: string;
}

export interface ProductVariant {
  externalId: string;
  name?: string;
  color?: string;
  size?: string;
  price?: number;
  listPrice?: number;
  inStock?: boolean;
}

export interface PricePointRow {
  scrapedAt: string;
  price: number | null;
  listPrice: number | null;
  previousPrice: number | null;
  priceDelta: number | null;
  inStock: boolean | null;
}

export interface ProductDetail extends Product {
  externalId: string;
  /** Siempre presente acá: la ficha se encontró por él o lo trae la fila. */
  slug: string;
  /**
   * Estado de disponibilidad sin traducir.
   *
   * `availability` (heredado de `Product`) ya viene como etiqueta legible en el
   * idioma de la página, que es lo que la vista pinta. El JSON-LD necesita el
   * valor crudo: "agotado" y "descontinuado" se traducen a URLs distintas de
   * schema.org —Google deja de mostrar el precio del segundo— y esa distinción
   * se pierde en la etiqueta.
   */
  availabilityStatus: AvailabilityStatus;
  sku?: string;
  gtin?: string;
  barcode?: string;
  model?: string;
  color?: string;
  size?: string;
  condition?: string;
  categoryPath: string[];
  /** Slug del nodo canónico, si el mapeo existe. Lo usan los relacionados. */
  categorySlug?: string;
  /** Categoría tal cual la nombra la tienda. */
  storeCategory?: string;
  unitMeasureName?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  stockQuantity?: number;
  minOrderQuantity?: number;
  memberPrice?: number;
  discountAmount?: number;
  warrantyMonths?: number;
  weightGrams?: number;
  images: ProductImage[];
  variants: ProductVariant[];
  specs: Record<string, unknown>;
  attributes: Record<string, unknown>;
  badges: string[];
  priceHistory: PricePointRow[];
  firstSeenAt: string;
  lastSeenAt: string;
  lastPriceChangeAt?: string;
  /** Cuántos días lleva el precio actual sin moverse. */
  daysAtCurrentPrice?: number;
  /** Mínimo histórico observado. Contexto real, no marketing. */
  lowestPrice?: number;
  highestPrice?: number;
}

/**
 * Forma de un uuid. Es lo que separa una URL vieja de una nueva sin tener que
 * pasar una bandera desde la ruta.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ficha completa. Devuelve `null` si el artículo no existe o dejó de estar
 * activo, para que la ruta responda 404 en vez de una página vacía.
 *
 * Acepta el slug público o el uuid. Los dos porque hay dos llamadores con
 * necesidades distintas: la ficha nueva llega por `/p/<slug>` y la ruta vieja
 * —`/producto/<uuid>`, la que sigue en el índice de Google y en los enlaces ya
 * compartidos— necesita resolver el uuid para poder redirigir. Distinguirlos
 * por la forma del texto evita un parámetro que habría que acertar en cada
 * llamada.
 */
export async function getProductDetail(
  key: string,
  locale: CatalogLocale = 'es',
): Promise<ProductDetail | null> {
  try {
    const db = getSupabaseAdmin();

    const { data, error } = await db
      .from('store_products')
      .select(
        `*,
         stores!inner(name, slug, logo_url, is_active),
         store_categories(name, categories(slug, name)),
         store_product_images(url, position, is_primary, alt_text),
         store_product_variants(external_id, name, color, size, price, list_price, in_stock)`,
      )
      .eq(UUID_PATTERN.test(key) ? 'id' : 'public_slug', key)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, never> & Record<string, unknown>;
    const store = row.stores as { name: string; slug: string } | null;
    if (!store) return null;

    // El histórico se pide aparte: es una serie que puede ser larga y no tiene
    // sentido arrastrarla en el mismo join.
    const { data: history } = await db
      .from('price_history')
      .select('scraped_at, price, list_price, previous_price, price_delta, in_stock')
      .eq('store_product_id', String(row.id))
      .order('scraped_at', { ascending: true })
      .limit(200);

    const priceHistory: PricePointRow[] = ((history ?? []) as Record<string, unknown>[]).map(
      (point) => ({
        scrapedAt: String(point.scraped_at),
        price: point.price === null ? null : Number(point.price),
        listPrice: point.list_price === null ? null : Number(point.list_price),
        previousPrice: point.previous_price === null ? null : Number(point.previous_price),
        priceDelta: point.price_delta === null ? null : Number(point.price_delta),
        inStock: point.in_stock as boolean | null,
      }),
    );

    const observedPrices = priceHistory
      .map((point) => point.price)
      .filter((price): price is number => price !== null);

    const images = ((row.store_product_images ?? []) as Record<string, unknown>[])
      .map((image) => ({
        url: String(image.url),
        position: Number(image.position ?? 0),
        isPrimary: Boolean(image.is_primary),
        altText: (image.alt_text as string | null) ?? undefined,
      }))
      .sort((a, b) => a.position - b.position);

    const variants = ((row.store_product_variants ?? []) as Record<string, unknown>[]).map(
      (variant) => ({
        externalId: String(variant.external_id),
        name: (variant.name as string | null) ?? undefined,
        color: (variant.color as string | null) ?? undefined,
        size: (variant.size as string | null) ?? undefined,
        price: variant.price === null ? undefined : Number(variant.price),
        listPrice: variant.list_price === null ? undefined : Number(variant.list_price),
        inStock: (variant.in_stock as boolean | null) ?? undefined,
      }),
    );

    const lastPriceChangeAt = (row.last_price_change_at as string | null) ?? undefined;
    const daysAtCurrentPrice = lastPriceChangeAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastPriceChangeAt).getTime()) / 86_400_000))
      : undefined;

    const num = (value: unknown): number | undefined =>
      value === null || value === undefined ? undefined : Number(value);
    const str = (value: unknown): string | undefined =>
      value === null || value === undefined || value === '' ? undefined : String(value);

    const storeCategory = row.store_categories as {
      name: string;
      categories: { slug: string; name: string } | null;
    } | null;
    const canonical = storeCategory?.categories ?? null;
    const availability = row.availability as AvailabilityStatus;

    return {
      id: String(row.id),
      /**
       * Respaldo por si la fila es anterior a la migración 0021 y todavía no
       * tiene slug: la ficha sigue abriendo por uuid en vez de romperse.
       */
      slug: str(row.public_slug) ?? String(row.id),
      externalId: String(row.external_id),
      name: String(row.name),
      price: Number(row.price ?? 0),
      currency: String(row.currency ?? 'HNL'),
      store: store.name,
      storeSlug: store.slug,
      category:
        canonical?.name ?? storeCategory?.name ?? str(row.category_raw) ?? 'Sin categoría',
      categoryPath: (row.category_path as string[] | null) ?? [],
      categorySlug: canonical?.slug,
      storeCategory: storeCategory?.name,
      imageUrl: str(row.primary_image_url),
      availability: AVAILABILITY_LABELS[locale][availability],
      availabilityStatus: availability,
      description: str(row.description),
      url: str(row.url),
      brand: str(row.brand_raw),
      listPrice: num(row.list_price),
      discountPercent: num(row.discount_percent),
      discountAmount: num(row.discount_amount),
      memberPrice: num(row.member_price),
      inStock: (row.in_stock as boolean | null) ?? undefined,
      stockQuantity: num(row.stock_quantity),
      minOrderQuantity: num(row.min_order_quantity),
      ratingAverage: num(row.rating_average),
      ratingCount: num(row.rating_count),
      sku: str(row.sku),
      gtin: str(row.gtin),
      barcode: str(row.barcode_raw),
      model: str(row.model),
      color: str(row.color),
      size: str(row.size),
      condition: str(row.condition),
      unitMeasureName: str(row.unit_measure_name),
      taxRate: num(row.tax_rate),
      taxIncluded: (row.tax_included as boolean | null) ?? undefined,
      warrantyMonths: num(row.warranty_months),
      weightGrams: num(row.weight_grams),
      images,
      variants,
      specs: (row.specs as Record<string, unknown>) ?? {},
      attributes: (row.attributes as Record<string, unknown>) ?? {},
      badges: (row.badges as string[] | null) ?? [],
      priceHistory,
      firstSeenAt: String(row.first_seen_at),
      lastSeenAt: String(row.last_seen_at),
      lastPriceChangeAt,
      daysAtCurrentPrice,
      lowestPrice: observedPrices.length ? Math.min(...observedPrices) : undefined,
      highestPrice: observedPrices.length ? Math.max(...observedPrices) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * El slug público de una ficha, a partir de su uuid.
 *
 * Existe aparte de `getProductDetail` porque la ruta vieja sólo necesita saber
 * a dónde redirigir: traerse la ficha entera —con imágenes, variantes y
 * doscientos puntos de histórico— para leer un campo y descartar el resto
 * convierte cada visita desde Google en una consulta de las caras.
 */
export async function getProductSlug(id: string): Promise<string | null> {
  if (!UUID_PATTERN.test(id)) return null;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('store_products')
      .select('public_slug')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) return null;
    const slug = (data as { public_slug: string | null }).public_slug;
    return slug && slug !== '' ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Artículos parecidos: misma categoría, distinto id, ordenados por descuento.
 *
 * Con mapeo canónico se busca por el nodo (que puede abarcar varias tiendas,
 * que es justamente lo interesante). Sin mapeo, por la categoría de la tienda
 * tal cual: es lo único que hay para agrupar.
 */
export async function getRelatedProducts(
  product: Pick<ProductDetail, 'id' | 'category' | 'categorySlug' | 'storeCategory'>,
  locale: CatalogLocale = 'es',
  limit = 8,
): Promise<Product[]> {
  const { products } = await searchCatalog({
    ...(product.categorySlug
      ? { category: product.categorySlug }
      : { storeCategory: product.storeCategory ?? product.category }),
    sort: 'discount',
    limit: limit + 1,
    locale,
  });
  return products.filter((candidate) => candidate.id !== product.id).slice(0, limit);
}
