import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getSupabaseAdmin } from '@/server/db/supabase';
import type { Locale } from '@/features/i18n/translate';
import type { FacetOption } from '@/features/products/categoryFacets';
import { DEFAULT_SORT } from '@/features/products/sortProducts';
import type { Product } from '@/types';
import {
  CATALOG_SEARCH_CACHE_SECONDS,
  CATALOG_SEARCH_CACHE_TAG,
  hasDatabase,
  searchCatalogCached,
} from './catalog';
import {
  byEditorialOrder,
  EMPTY_SCOPED_FACETS,
  INITIAL_BATCH,
  loadCategoryTree,
  POPULAR_PRODUCTS_LIMIT,
  type CategoryNode,
  type ScopedFacets,
} from './categoryPages';

/**
 * Datos de las páginas de tienda (migración 0033).
 *
 * Tres páginas: el índice (`/tiendas`), la de cada tienda
 * (`/tiendas/<tienda>`) y la de una categoría dentro de una tienda
 * (`/tiendas/<tienda>/<categoría>`: "Abarrotes en PriceSmart"). Son landings
 * para las búsquedas que nombran al comercio, y como las de categoría se
 * sirven con ISR de una hora.
 *
 * La regla que manda: solo existen las combinaciones con artículos. Una
 * tienda que no vende abarrotes no tiene página de abarrotes, ni se enlaza
 * ni se lista en el sitemap. Es lo que evita publicar cientos de landings
 * vacías, que es lo peor que se le puede dar a un buscador.
 *
 * Lo que se lee:
 *   - `stores`: nombre, imagen y texto alternativo.
 *   - `v_catalog_store_facets`: cuántos artículos comprables tiene cada tienda.
 *   - `v_catalog_store_category_facets`: qué nodos canónicos tiene cada tienda.
 *   - el árbol de `categoryPages.ts`, con los conteos reemplazados por los de
 *     la tienda.
 *   - `catalog_store_facets()` y `searchCatalogCached`: primer lote y facetas
 *     del buscador acotado.
 */

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface StoreNode {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  imageUrl: string | null;
  imageAlt: string | null;
  /** Artículos comprables hoy. */
  productCount: number;
  /** Cuántas raíces del árbol canónico tiene con artículos. */
  categoryCount: number;
}

export interface StoreIndexData {
  /** Tiendas con artículos, de más a menos surtido. */
  stores: StoreNode[];
  totalProducts: number;
}

export interface StorePageData {
  store: StoreNode;
  /**
   * La categoría acotada, o `null` en la landing de la tienda entera. Sus
   * conteos son los de ESTA tienda, no los globales.
   */
  category: CategoryNode | null;
  parent: CategoryNode | null;
  /** Raíces (landing de tienda) o hijas (landing de categoría) con artículos en la tienda. */
  children: CategoryNode[];
  /** Hermanas con artículos en la tienda, para el "también en …" de una hoja. */
  siblings: CategoryNode[];
  /** Los más pedidos dentro del alcance; rellenado con ofertas si faltan clics. */
  popular: Product[];
  initialProducts: Product[];
  facets: ScopedFacets;
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

interface RawStore {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  logo_url: string | null;
  image_alt: string | null;
}

/** Tiendas activas con su cifra. Sin la 0033 no hay `image_alt`: se pinta sin él. */
async function loadStoreRows(): Promise<StoreNode[]> {
  const db = getSupabaseAdmin();
  const selectStores = (columns: string) =>
    db.from('stores').select(columns).eq('is_active', true).order('name');

  const [firstTry, facets] = await Promise.all([
    selectStores('id, slug, name, base_url, logo_url, image_alt'),
    db.from('v_catalog_store_facets').select('store_slug, product_count'),
  ]);
  const stores =
    firstTry.error && firstTry.error.code === '42703'
      ? await selectStores('id, slug, name, base_url, logo_url')
      : firstTry;
  if (stores.error) throw new Error(stores.error.message);
  if (facets.error) throw new Error(facets.error.message);

  const counts = new Map<string, number>();
  for (const row of (facets.data ?? []) as Array<{ store_slug: string; product_count: number }>) {
    counts.set(row.store_slug, Number(row.product_count ?? 0));
  }

  return ((stores.data ?? []) as unknown as Partial<RawStore>[]).map((row) => {
    const slug = String(row.slug);
    return {
      id: String(row.id),
      slug,
      name: String(row.name),
      baseUrl: String(row.base_url ?? ''),
      imageUrl: row.logo_url ?? null,
      imageAlt: row.image_alt ?? null,
      productCount: counts.get(slug) ?? 0,
      categoryCount: 0,
    };
  });
}

/**
 * Las tiendas y el conteo tienda × categoría, en caché cinco minutos con la
 * etiqueta del catálogo. El conteo agrupa la materializada entera (~83 000
 * filas) y era lo que hacía esperar a cada landing; cambia solo con el
 * scraping, que ya invalida la etiqueta.
 */
const loadStoreRowsCached = unstable_cache(loadStoreRows, ['store-rows'], {
  revalidate: CATALOG_SEARCH_CACHE_SECONDS,
  tags: [CATALOG_SEARCH_CACHE_TAG],
});

/** Tiendas por slug. Una sola vez por petición (React `cache`). */
const loadStores = cache(async (): Promise<Map<string, StoreNode>> => {
  const rows = await loadStoreRowsCached();
  return new Map(rows.map((row) => [row.slug, { ...row }]));
});

interface StoreCategoryCountRow {
  store_slug: string;
  slug: string;
  product_count: number;
}

/** Conteo directo por (tienda, slug de categoría). Vacío si la 0033 no corrió. */
const loadStoreCategoryCountRows = unstable_cache(
  async (): Promise<StoreCategoryCountRow[]> => {
    const { data, error } = await getSupabaseAdmin()
      .from('v_catalog_store_category_facets')
      .select('store_slug, slug, product_count');
    return error ? [] : ((data ?? []) as StoreCategoryCountRow[]);
  },
  ['store-category-counts'],
  { revalidate: CATALOG_SEARCH_CACHE_SECONDS, tags: [CATALOG_SEARCH_CACHE_TAG] },
);

const loadStoreCategoryCounts = cache(async (): Promise<Map<string, Map<string, number>>> => {
  const byStore = new Map<string, Map<string, number>>();
  for (const row of await loadStoreCategoryCountRows()) {
    const counts = byStore.get(row.store_slug) ?? new Map<string, number>();
    counts.set(row.slug, Number(row.product_count ?? 0));
    byStore.set(row.store_slug, counts);
  }
  return byStore;
});

/**
 * El árbol canónico con los conteos de UNA tienda: directo por nodo y, en
 * las raíces, la suma de sus hijas. Devuelve solo los nodos con artículos en
 * esa tienda, ya ordenados.
 */
function scopeTreeToStore(
  nodes: CategoryNode[],
  counts: Map<string, number>,
): { nodes: CategoryNode[]; byId: Map<string, CategoryNode>; bySlug: Map<string, CategoryNode> } {
  const scoped = nodes.map((node) => ({ ...node, productCount: counts.get(node.slug) ?? 0 }));
  const byId = new Map(scoped.map((node) => [node.id, node]));
  for (const node of scoped) {
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent) parent.productCount += node.productCount;
    }
  }
  const withProducts = scoped.filter((node) => node.productCount > 0);
  return {
    nodes: withProducts,
    byId: new Map(withProducts.map((node) => [node.id, node])),
    bySlug: new Map(withProducts.map((node) => [node.slug, node])),
  };
}

// -----------------------------------------------------------------------------
// Índice
// -----------------------------------------------------------------------------

export const getStoreIndex = cache(async (): Promise<StoreIndexData> => {
  if (!hasDatabase()) return { stores: [], totalProducts: 0 };

  const [stores, counts, tree] = await Promise.all([
    loadStores(),
    loadStoreCategoryCounts(),
    loadCategoryTree('es'),
  ]);

  const list: StoreNode[] = [];
  for (const store of stores.values()) {
    if (store.productCount === 0) continue;
    const scoped = scopeTreeToStore(tree.nodes, counts.get(store.slug) ?? new Map());
    list.push({
      ...store,
      categoryCount: scoped.nodes.filter((node) => node.parentId === null).length,
    });
  }
  list.sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));

  return {
    stores: list,
    totalProducts: list.reduce((sum, store) => sum + store.productCount, 0),
  };
});

// -----------------------------------------------------------------------------
// Página de una tienda, con o sin categoría
// -----------------------------------------------------------------------------

/**
 * Los más pedidos de la tienda (y de la categoría, si hay). Mismo método que
 * en `categoryPages.ts`: ids por clics desde la tabla viva, filas desde la
 * materializada, y ofertas para completar.
 */
async function getPopularProducts(
  store: StoreNode,
  category: CategoryNode | null,
  children: CategoryNode[],
  locale: Locale,
  limit: number,
): Promise<Product[]> {
  const db = getSupabaseAdmin();

  let request = db
    .from('store_products')
    .select(
      category
        ? 'id, click_count, store_categories!inner(category_id)'
        : 'id, click_count',
    )
    .eq('store_id', store.id)
    .gt('click_count', 0)
    .eq('is_active', true);
  if (category) {
    request = request.in(
      'store_categories.category_id',
      [category.id, ...children.map((child) => child.id)],
    );
  }
  const clicked = await request
    .order('click_count', { ascending: false })
    .order('last_clicked_at', { ascending: false })
    .limit(limit * 2);

  const clickedIds = clicked.error
    ? []
    : ((clicked.data ?? []) as unknown as Array<{ id: string }>).map((row) => row.id);

  const scope = {
    storeSlug: store.slug,
    ...(category ? { category: category.slug } : {}),
    locale,
    sort: 'discount' as const,
    withTotal: false,
  };

  const [byClicks, byOffers] = await Promise.all([
    clickedIds.length > 0
      ? searchCatalogCached({ ...scope, ids: clickedIds, limit: clickedIds.length })
      : Promise.resolve({ products: [] as Product[], total: null }),
    searchCatalogCached({ ...scope, limit }),
  ]);

  const rank = new Map(clickedIds.map((id, index) => [id, index]));
  const popular = [...byClicks.products].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
  const seen = new Set(popular.map((product) => product.id));
  for (const product of byOffers.products) {
    if (popular.length >= limit) break;
    if (seen.has(product.id)) continue;
    popular.push(product);
    seen.add(product.id);
  }
  return popular.slice(0, limit);
}

async function getScopedFacets(storeSlug: string, categorySlug: string | null): Promise<ScopedFacets> {
  const { data, error } = await getSupabaseAdmin().rpc('catalog_store_facets', {
    p_store_slug: storeSlug,
    p_slug: categorySlug,
  });
  if (error || !data) return EMPTY_SCOPED_FACETS;

  const payload = data as {
    total?: number;
    discounted?: number;
    minPrice?: number;
    maxPrice?: number;
    brands?: Array<{ value: string; count: number }>;
  };
  const toOptions = (rows: Array<{ value: string; count: number }> | undefined): FacetOption[] =>
    (rows ?? [])
      .filter((row) => row.value && row.count > 0)
      .map((row) => ({ value: String(row.value), count: Number(row.count) }));

  return {
    total: Number(payload.total ?? 0),
    discounted: Number(payload.discounted ?? 0),
    minPrice: Number(payload.minPrice ?? 0),
    maxPrice: Number(payload.maxPrice ?? 0),
    stores: [],
    brands: toOptions(payload.brands),
  };
}

/**
 * Todo lo que la landing de una tienda (o de una categoría dentro de ella)
 * necesita, o `null` si la tienda no existe, no tiene artículos, o no vende
 * esa categoría. Ese último caso es un 404 a propósito: "Abarrotes en
 * Okashi" no es una página.
 */
export const getStorePage = cache(async (
  storeSlug: string,
  categorySlug: string | null,
  locale: Locale,
): Promise<StorePageData | null> => {
  if (!hasDatabase()) return null;

  const [stores, counts, tree] = await Promise.all([
    loadStores(),
    loadStoreCategoryCounts(),
    loadCategoryTree(locale),
  ]);
  const base = stores.get(storeSlug);
  if (!base || base.productCount === 0) return null;

  const scoped = scopeTreeToStore(tree.nodes, counts.get(storeSlug) ?? new Map());
  const roots = scoped.nodes.filter((node) => node.parentId === null).sort(byEditorialOrder);
  const store: StoreNode = { ...base, categoryCount: roots.length };

  let category: CategoryNode | null = null;
  let parent: CategoryNode | null = null;
  let children: CategoryNode[] = roots;
  let siblings: CategoryNode[] = [];

  if (categorySlug !== null) {
    category = scoped.bySlug.get(categorySlug) ?? null;
    if (!category) return null;
    parent = category.parentId ? (scoped.byId.get(category.parentId) ?? null) : null;
    children = scoped.nodes.filter((node) => node.parentId === category!.id).sort(byEditorialOrder);
    siblings = parent
      ? scoped.nodes
          .filter((node) => node.parentId === parent!.id && node.id !== category!.id)
          .sort(byEditorialOrder)
      : [];
  }

  const [popular, initial, facets] = await Promise.all([
    getPopularProducts(store, category, category ? children : [], locale, POPULAR_PRODUCTS_LIMIT),
    searchCatalogCached({
      storeSlug: store.slug,
      ...(category ? { category: category.slug } : {}),
      locale,
      sort: DEFAULT_SORT,
      limit: INITIAL_BATCH,
      withTotal: false,
    }),
    getScopedFacets(store.slug, category?.slug ?? null),
  ]);

  return { store, category, parent, children, siblings, popular, initialProducts: initial.products, facets };
});

// -----------------------------------------------------------------------------
// Sitemap
// -----------------------------------------------------------------------------

export interface StoreSitemapEntry {
  storeSlug: string;
  /** `null` en la landing de la tienda entera. */
  categorySlug: string | null;
  level: number;
}

/** Todas las landings de tienda que existen: la tienda y cada categoría que vende. */
export async function listStorePathsForSitemap(): Promise<StoreSitemapEntry[]> {
  if (!hasDatabase()) return [];
  const [stores, counts, tree] = await Promise.all([
    loadStores(),
    loadStoreCategoryCounts(),
    loadCategoryTree('es'),
  ]);

  const entries: StoreSitemapEntry[] = [];
  for (const store of stores.values()) {
    if (store.productCount === 0) continue;
    entries.push({ storeSlug: store.slug, categorySlug: null, level: -1 });
    const scoped = scopeTreeToStore(tree.nodes, counts.get(store.slug) ?? new Map());
    for (const node of scoped.nodes) {
      entries.push({ storeSlug: store.slug, categorySlug: node.slug, level: node.level });
    }
  }
  return entries;
}

// -----------------------------------------------------------------------------
// Alcances del buscador de la barra
// -----------------------------------------------------------------------------

export interface SearchScopeCategory {
  slug: string;
  name: string;
  children: { slug: string; name: string }[];
}

export interface SearchScope {
  /** La tienda del alcance, o `null` si se pidió el catálogo entero. */
  store: { slug: string; name: string } | null;
  /** Raíces con artículos (en la tienda, si hay tienda) y sus hijas. */
  categories: SearchScopeCategory[];
}

/**
 * Las categorías que ofrece el selector del buscador: las del catálogo
 * entero o, con tienda, solo las que esa tienda vende. Mismo árbol y mismo
 * orden que las landings, así el selector y la página dicen lo mismo.
 */
export async function getSearchScope(storeSlug: string | null, locale: Locale): Promise<SearchScope> {
  if (!hasDatabase()) return { store: null, categories: [] };

  const [stores, counts, tree] = await Promise.all([
    storeSlug ? loadStores() : Promise.resolve(null),
    storeSlug ? loadStoreCategoryCounts() : Promise.resolve(null),
    loadCategoryTree(locale),
  ]);

  const store = storeSlug ? (stores?.get(storeSlug) ?? null) : null;
  const nodes =
    store && counts
      ? scopeTreeToStore(tree.nodes, counts.get(store.slug) ?? new Map()).nodes
      : tree.nodes.filter((node) => node.productCount > 0);

  const childrenOf = new Map<string, CategoryNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }

  const categories = nodes
    .filter((node) => node.parentId === null)
    .sort(byEditorialOrder)
    .map((root) => ({
      slug: root.slug,
      name: root.name,
      children: (childrenOf.get(root.id) ?? [])
        .sort(byEditorialOrder)
        .map((child) => ({ slug: child.slug, name: child.name })),
    }));

  return { store: store ? { slug: store.slug, name: store.name } : null, categories };
}
