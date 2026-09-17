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

/**
 * Datos de las páginas de categoría (migración 0031).
 *
 * Dos páginas: el índice (`/categorias`) y la de cada nodo
 * (`/categorias/<slug>`), raíz o hija. Las dos son landings para búsqueda
 * orgánica y se sirven con ISR de una hora, así que este módulo puede
 * permitirse varios viajes a la base por render: se paga una vez por hora y
 * por categoría, no por visitante.
 *
 * Lo que se lee:
 *   - `categories` + `category_content`: el árbol y su texto por idioma.
 *   - `v_catalog_canonical_category_facets`: cuántos artículos comprables
 *     tiene cada nodo. Una categoría sin artículos no se enlaza ni se indexa.
 *   - `store_products.click_count`: los más pedidos de la categoría.
 *   - `catalog_category_facets()` y `searchCatalogCached`: el primer lote y
 *     las facetas del buscador acotado.
 */

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface CategoryContent {
  title: string | null;
  metaDescription: string | null;
  intro: string | null;
  body: string | null;
  keywords: string[];
}

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  level: number;
  position: number;
  imageUrl: string | null;
  imageAlt: string | null;
  featuredPosition: number | null;
  /** Artículos comprables: los propios más los de sus hijas. */
  productCount: number;
  content: CategoryContent;
}

export interface CategoryIndexData {
  /** Raíces con artículos, ordenadas por posición editorial y luego por nombre. */
  roots: CategoryNode[];
  /** Las destacadas (`featured_position`), en su orden. Solo con artículos. */
  featured: CategoryNode[];
  /** Hijas por id de raíz, para el megamenú/columnas del índice. */
  childrenOf: Record<string, CategoryNode[]>;
  totalProducts: number;
}

export interface ScopedFacets {
  total: number;
  discounted: number;
  minPrice: number;
  maxPrice: number;
  stores: FacetOption[];
  brands: FacetOption[];
}

export interface CategoryPageData {
  category: CategoryNode;
  parent: CategoryNode | null;
  /** Hijas con artículos. Vacío en una hoja. */
  children: CategoryNode[];
  /** Hermanas (misma madre), para el "también en …" de una hija. */
  siblings: CategoryNode[];
  /** Los más pedidos de la categoría; rellenado con ofertas si faltan clics. */
  popular: Product[];
  /** Primer lote del buscador acotado, con el orden por defecto. */
  initialProducts: Product[];
  facets: ScopedFacets;
}

// -----------------------------------------------------------------------------
// Lectura del árbol
// -----------------------------------------------------------------------------

interface RawCategory {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  level: number;
  position: number;
  is_active: boolean;
  image_url: string | null;
  image_alt: string | null;
  featured_position: number | null;
}

interface RawContent {
  category_id: string;
  locale: string;
  title: string | null;
  meta_description: string | null;
  intro: string | null;
  body: string | null;
  keywords: string[] | null;
}

/**
 * Texto de una categoría en un idioma, campo por campo con caída al otro
 * idioma. Es por campo y no por fila: una intro en inglés sin cuerpo en
 * inglés debe mostrar la intro inglesa y el cuerpo español, no todo español.
 */
function pickContent(rows: RawContent[], locale: Locale): CategoryContent {
  const own = rows.find((row) => row.locale === locale);
  const other = rows.find((row) => row.locale !== locale);
  const pick = <K extends keyof RawContent>(key: K): RawContent[K] | null =>
    (own?.[key] ?? other?.[key] ?? null) as RawContent[K] | null;
  return {
    title: pick('title'),
    metaDescription: pick('meta_description'),
    intro: pick('intro'),
    body: pick('body'),
    keywords: (own?.keywords?.length ? own.keywords : (other?.keywords ?? [])) ?? [],
  };
}

export interface CategoryTree {
  nodes: CategoryNode[];
  byId: Map<string, CategoryNode>;
  bySlug: Map<string, CategoryNode>;
}

/** Los nodos del árbol, sin los mapas: es lo que se puede guardar en caché. */
async function loadCategoryNodes(locale: Locale): Promise<CategoryNode[]> {
  const db = getSupabaseAdmin();

  const selectCategories = (columns: string) =>
    db.from('categories').select(columns).eq('is_active', true).order('level').order('position').order('name');

  const [firstTry, content, facets] = await Promise.all([
    selectCategories(
      'id, parent_id, slug, name, level, position, is_active, image_url, image_alt, featured_position',
    ),
    db
      .from('category_content')
      .select('category_id, locale, title, meta_description, intro, body, keywords'),
    db.from('v_catalog_canonical_category_facets').select('slug, parent_slug, product_count'),
  ]);

  // Sin la 0031 no hay imagen ni texto, pero el árbol sigue: se pinta pelado.
  // Mismo cuidado que en catalog.ts con las columnas nuevas de la vista.
  const categories =
    firstTry.error && firstTry.error.code === '42703'
      ? await selectCategories('id, parent_id, slug, name, level, position, is_active')
      : firstTry;
  if (categories.error) throw new Error(categories.error.message);
  const contentRows = (content.error ? [] : (content.data ?? [])) as RawContent[];
  if (facets.error) throw new Error(facets.error.message);

  // Conteo directo por slug; el de una raíz suma el de sus hijas.
  const direct = new Map<string, number>();
  for (const row of (facets.data ?? []) as Array<{
    slug: string | null;
    parent_slug: string | null;
    product_count: number;
  }>) {
    if (!row.slug) continue;
    direct.set(row.slug, (direct.get(row.slug) ?? 0) + Number(row.product_count ?? 0));
  }

  const contentByCategory = new Map<string, RawContent[]>();
  for (const row of contentRows) {
    const list = contentByCategory.get(row.category_id) ?? [];
    list.push(row);
    contentByCategory.set(row.category_id, list);
  }

  const raw = (categories.data ?? []) as unknown as Partial<RawCategory>[];
  const nodes: CategoryNode[] = raw.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    parentId: row.parent_id ?? null,
    level: Number(row.level),
    position: Number(row.position),
    imageUrl: row.image_url ?? null,
    imageAlt: row.image_alt ?? null,
    featuredPosition: row.featured_position ?? null,
    productCount: direct.get(String(row.slug)) ?? 0,
    content: pickContent(contentByCategory.get(String(row.id)) ?? [], locale),
  }));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent) parent.productCount += node.productCount;
    }
  }

  return nodes;
}

/**
 * Los nodos, en caché cinco minutos y con la etiqueta del catálogo: son
 * tres viajes a la base que cada landing de categoría y de tienda repite, y
 * el árbol solo cambia con el scraping o con el panel, que ya invalidan la
 * etiqueta. Se guardan los nodos y no los mapas porque la caché de Next
 * serializa a JSON.
 */
const loadCategoryNodesCached = unstable_cache(loadCategoryNodes, ['category-tree'], {
  revalidate: CATALOG_SEARCH_CACHE_SECONDS,
  tags: [CATALOG_SEARCH_CACHE_TAG],
});

/**
 * El árbol entero con conteos y texto. Una sola vez por petición aunque lo
 * pidan `generateMetadata` y la página (React `cache`).
 */
export const loadCategoryTree = cache(async (locale: Locale): Promise<CategoryTree> => {
  // Copia por nodo: los de la caché son compartidos y el servicio de tiendas
  // reescala los conteos sobre su propia copia.
  const nodes = (await loadCategoryNodesCached(locale)).map((node) => ({ ...node }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return { nodes, byId, bySlug: new Map(nodes.map((node) => [node.slug, node])) };
});

/** Orden editorial: destacadas primero por su posición, luego por artículos. */
export function byEditorialOrder(a: CategoryNode, b: CategoryNode): number {
  return a.position - b.position || b.productCount - a.productCount || a.name.localeCompare(b.name);
}

// -----------------------------------------------------------------------------
// Índice
// -----------------------------------------------------------------------------

export const getCategoryIndex = cache(async (locale: Locale): Promise<CategoryIndexData> => {
  if (!hasDatabase()) return { roots: [], featured: [], childrenOf: {}, totalProducts: 0 };

  const tree = await loadCategoryTree(locale);
  const withProducts = tree.nodes.filter((node) => node.productCount > 0);

  const roots = withProducts.filter((node) => node.parentId === null).sort(byEditorialOrder);
  const childrenOf: Record<string, CategoryNode[]> = {};
  for (const node of withProducts) {
    if (!node.parentId) continue;
    (childrenOf[node.parentId] ??= []).push(node);
  }
  for (const list of Object.values(childrenOf)) list.sort(byEditorialOrder);

  const featured = withProducts
    .filter((node) => node.featuredPosition !== null)
    .sort((a, b) => (a.featuredPosition ?? 0) - (b.featuredPosition ?? 0));

  return {
    roots,
    featured,
    childrenOf,
    totalProducts: roots.reduce((sum, root) => sum + root.productCount, 0),
  };
});

// -----------------------------------------------------------------------------
// Página de una categoría
// -----------------------------------------------------------------------------

/** Cuántos artículos populares se muestran. Dos filas de seis en escritorio. */
export const POPULAR_PRODUCTS_LIMIT = 12;

/** Tamaño del primer lote del buscador acotado; igual que la portada. */
export const INITIAL_BATCH = 48;

/**
 * Los más pedidos de una categoría.
 *
 * Dos pasos: los ids con más clics (tabla viva, índice parcial), y después
 * sus filas desde la materializada, que es la que sabe si siguen comprables.
 * Un artículo muy clicado que ya se agotó no aparece: la materializada no lo
 * tiene. Si no llegan a `limit`, se completa con las mejores ofertas de la
 * categoría para que la sección nunca salga a medias.
 */
async function getPopularProducts(
  category: CategoryNode,
  children: CategoryNode[],
  locale: Locale,
  limit: number,
): Promise<Product[]> {
  const db = getSupabaseAdmin();
  const categoryIds = [category.id, ...children.map((child) => child.id)];

  const clicked = await db
    .from('store_products')
    .select('id, click_count, store_categories!inner(category_id)')
    .in('store_categories.category_id', categoryIds)
    .gt('click_count', 0)
    .eq('is_active', true)
    .order('click_count', { ascending: false })
    .order('last_clicked_at', { ascending: false })
    .limit(limit * 2);

  // Sin la columna (0031 sin aplicar) o cualquier otro fallo: solo ofertas.
  const clickedIds = clicked.error
    ? []
    : ((clicked.data ?? []) as Array<{ id: string }>).map((row) => row.id);

  const scope = { category: category.slug, locale, sort: 'discount' as const, withTotal: false };

  const [byClicks, byOffers] = await Promise.all([
    clickedIds.length > 0
      ? searchCatalogCached({ ...scope, ids: clickedIds, limit: clickedIds.length })
      : Promise.resolve({ products: [] as Product[], total: null }),
    searchCatalogCached({ ...scope, limit }),
  ]);

  // Los clicados conservan su orden por clics: `in (...)` no lo garantiza.
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

export const EMPTY_SCOPED_FACETS: ScopedFacets = {
  total: 0,
  discounted: 0,
  minPrice: 0,
  maxPrice: 0,
  stores: [],
  brands: [],
};

async function getScopedFacets(slug: string): Promise<ScopedFacets> {
  const { data, error } = await getSupabaseAdmin().rpc('catalog_category_facets', {
    p_slug: slug,
  });
  if (error || !data) return EMPTY_SCOPED_FACETS;

  const payload = data as {
    total?: number;
    discounted?: number;
    minPrice?: number;
    maxPrice?: number;
    stores?: Array<{ value: string; count: number }>;
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
    stores: toOptions(payload.stores),
    brands: toOptions(payload.brands),
  };
}

/**
 * Todo lo que la página de una categoría necesita, o `null` si el slug no
 * existe, está inactivo o no tiene artículos comprables. Ese último caso es
 * un 404 a propósito: una landing vacía es la peor página que se puede
 * ofrecer a un buscador.
 */
export const getCategoryPage = cache(async (
  slug: string,
  locale: Locale,
): Promise<CategoryPageData | null> => {
  if (!hasDatabase()) return null;

  const tree = await loadCategoryTree(locale);
  const category = tree.bySlug.get(slug);
  if (!category || category.productCount === 0) return null;

  const parent = category.parentId ? (tree.byId.get(category.parentId) ?? null) : null;
  const children = tree.nodes
    .filter((node) => node.parentId === category.id && node.productCount > 0)
    .sort(byEditorialOrder);
  const siblings = parent
    ? tree.nodes
        .filter(
          (node) => node.parentId === parent.id && node.id !== category.id && node.productCount > 0,
        )
        .sort(byEditorialOrder)
    : [];

  const [popular, initial, facets] = await Promise.all([
    getPopularProducts(category, children, locale, POPULAR_PRODUCTS_LIMIT),
    searchCatalogCached({
      category: category.slug,
      locale,
      sort: DEFAULT_SORT,
      limit: INITIAL_BATCH,
      withTotal: false,
    }),
    getScopedFacets(category.slug),
  ]);

  return {
    category,
    parent,
    children,
    siblings,
    popular,
    initialProducts: initial.products,
    facets,
  };
});

/**
 * Slugs de todas las categorías con artículos, para el sitemap. Devuelve
 * también el padre para poder emitir la jerarquía en el índice.
 */
export async function listCategorySlugsForSitemap(): Promise<
  Array<{ slug: string; level: number; updatedAt: string | null }>
> {
  if (!hasDatabase()) return [];
  const tree = await loadCategoryTree('es');
  return tree.nodes
    .filter((node) => node.productCount > 0)
    .map((node) => ({ slug: node.slug, level: node.level, updatedAt: null }));
}

/** Suma un clic a un producto. Nunca lanza: un contador no tumba una página. */
export async function recordProductClick(productId: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  const { error } = await getSupabaseAdmin().rpc('record_product_click', {
    p_product_id: productId,
  });
  return !error;
}
