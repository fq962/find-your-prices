import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';
import type { AvailabilityStatus } from '@/server/scraping/types';
import type { Product } from '@/types';

/**
 * Lectura del catálogo público.
 *
 * Lee de `v_store_products_current`, que ya trae tienda, marca y categoría
 * resueltas. La vista filtra por `is_active`, así que lo que sale de acá es
 * siempre oferta viva.
 *
 * Punto importante de diseño: el catálogo son miles de artículos y no se
 * mandan todos al navegador. La página sirve un primer lote curado y la
 * búsqueda sobre el catálogo completo va contra Postgres (ver `searchCatalog`).
 */

/** Fila cruda de la vista. */
interface CatalogRow {
  id: string;
  store_slug: string;
  store_name: string;
  name: string;
  url: string | null;
  primary_image_url: string | null;
  brand: string | null;
  category_raw: string | null;
  store_category_name: string | null;
  currency: string;
  price: number | null;
  list_price: number | null;
  discount_percent: number | null;
  availability: AvailabilityStatus;
  in_stock: boolean | null;
}

const VIEW = 'v_store_products_current';
const COLUMNS =
  'id, store_slug, store_name, name, url, primary_image_url, brand, category_raw, ' +
  'store_category_name, currency, price, list_price, discount_percent, availability, in_stock';

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
    name: row.name,
    price: row.price ?? 0,
    currency: row.currency,
    store: row.store_name,
    storeSlug: row.store_slug,
    // La categoría de la tienda es más específica que la cruda; se prefiere.
    category: row.store_category_name ?? row.category_raw ?? 'Sin categoría',
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
  };
}

export interface CatalogSnapshot {
  products: Product[];
  stores: string[];
  categories: string[];
  /** Total de ofertas activas en la base, no solo las servidas. */
  totalProducts: number;
  totalStores: number;
  totalCategories: number;
}

/** Snapshot vacío: se usa cuando la base todavía no está disponible. */
const EMPTY_SNAPSHOT: CatalogSnapshot = {
  products: [],
  stores: [],
  categories: [],
  totalProducts: 0,
  totalStores: 0,
  totalCategories: 0,
};

/**
 * Primer lote que ve el visitante.
 *
 * Se ordena por descuento: lo que más bajó de precio es lo que justifica que
 * exista un comparador. Mostrar los primeros N alfabéticamente no le diría
 * nada a nadie.
 */
export async function getCatalogSnapshot(options?: {
  limit?: number;
  locale?: CatalogLocale;
}): Promise<CatalogSnapshot> {
  const limit = options?.limit ?? 90;
  const locale = options?.locale ?? 'es';

  try {
    const db = getSupabaseAdmin();

    const [rowsResult, countResult, facetsResult] = await Promise.all([
      db
        .from(VIEW)
        .select(COLUMNS)
        .not('price', 'is', null)
        .order('discount_percent', { ascending: false, nullsFirst: false })
        .order('price', { ascending: false })
        .limit(limit),
      db.from(VIEW).select('id', { count: 'exact', head: true }),
      // Las facetas salen de las tablas de dimensión, no de las filas servidas:
      // si se dedujeran del lote, los filtros solo mostrarían lo que ya se ve.
      loadFacets(),
    ]);

    if (rowsResult.error) throw new Error(rowsResult.error.message);

    const rows = (rowsResult.data ?? []) as unknown as CatalogRow[];

    return {
      products: rows.map((row) => toProduct(row, locale)),
      stores: facetsResult.stores,
      categories: facetsResult.categories,
      totalProducts: countResult.count ?? rows.length,
      totalStores: facetsResult.stores.length,
      totalCategories: facetsResult.categories.length,
    };
  } catch {
    // Sin base (migraciones sin correr, red caída) la home no debe romperse:
    // la vista de arriba decide qué mostrar con un catálogo vacío.
    return EMPTY_SNAPSHOT;
  }
}

/** Tiendas y categorías disponibles para los filtros. */
async function loadFacets(): Promise<{ stores: string[]; categories: string[] }> {
  const db = getSupabaseAdmin();

  const [storesResult, categoriesResult] = await Promise.all([
    db.from('stores').select('name').eq('is_active', true).order('name'),
    db
      .from('store_categories')
      .select('name')
      .eq('is_active', true)
      .order('name')
      .limit(400),
  ]);

  const stores = (storesResult.data ?? []).map((row) => row.name as string);
  const categories = Array.from(
    new Set((categoriesResult.data ?? []).map((row) => row.name as string)),
  ).sort((a, b) => a.localeCompare(b, 'es'));

  return { stores, categories };
}

export type CatalogSort = 'relevance' | 'price-asc' | 'price-desc' | 'discount';

export interface SearchCatalogParams {
  query?: string;
  store?: string;
  category?: string;
  sort?: CatalogSort;
  limit?: number;
  locale?: CatalogLocale;
}

/**
 * Búsqueda sobre el catálogo completo, resuelta en Postgres.
 *
 * Es lo que hace honesta a la caja de búsqueda: filtrar en el navegador solo
 * encontraría entre los ~90 artículos ya servidos, y el usuario creería que el
 * resto no existe.
 */
export async function searchCatalog(params: SearchCatalogParams): Promise<Product[]> {
  const limit = Math.min(params.limit ?? 60, 200);
  const locale = params.locale ?? 'es';

  try {
    let request = getSupabaseAdmin().from(VIEW).select(COLUMNS).not('price', 'is', null);

    const query = params.query?.trim();
    if (query) {
      // ilike con comodines a ambos lados: busca la frase en cualquier parte
      // del nombre. Los % del usuario se escapan para que no sean comodines.
      const safe = query.replace(/[%_]/g, (char) => `\\${char}`);
      request = request.ilike('name', `%${safe}%`);
    }
    if (params.store) request = request.eq('store_name', params.store);
    if (params.category) request = request.eq('store_category_name', params.category);

    switch (params.sort) {
      case 'price-asc':
        request = request.order('price', { ascending: true });
        break;
      case 'price-desc':
        request = request.order('price', { ascending: false });
        break;
      case 'discount':
        request = request.order('discount_percent', { ascending: false, nullsFirst: false });
        break;
      default:
        request = request.order('discount_percent', { ascending: false, nullsFirst: false });
    }

    const { data, error } = await request.limit(limit);
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as CatalogRow[]).map((row) => toProduct(row, locale));
  } catch {
    return [];
  }
}
