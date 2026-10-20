import 'server-only';
import { cache } from 'react';
import { BROWSE_PAGE_SIZE, browsePageCount } from '@/features/products/browsePaging';
import type { Product } from '@/types';
import { hasDatabase, searchCatalogCached } from './catalog';
import { loadCategoryTree, type CategoryNode } from './categoryPages';
import { getStoreNode, type StoreNode } from './storePages';

/**
 * Datos de los listados paginados "todos los productos", de una categoría o de
 * una tienda. Ver `features/products/browsePaging.ts` para por qué existen.
 *
 * Solo en español: son puertas para que el rastreador llegue a las fichas, y
 * las fichas que se indexan son las españolas (ver `productMetadata`).
 *
 * El orden es alfabético y no el de la landing (descuento), a propósito. El
 * descuento cambia con cada corrida de scraping y los artículos saltarían de
 * página en página; por nombre, la página 37 de hoy es casi la de mañana, y lo
 * que el rastreador aprendió de ella sigue valiendo.
 */

export interface BrowsePageData<Scope> {
  scope: Scope;
  page: number;
  pageCount: number;
  /** Artículos comprables del alcance: el mismo número que anuncia la landing. */
  total: number;
  products: Product[];
}

export interface CategoryBrowseScope {
  category: CategoryNode;
  parent: CategoryNode | null;
}

/**
 * Una página. `null` si la página no existe —fuera de rango, o vacía porque el
 * catálogo se achicó entre el conteo y la consulta—: es un 404, no una lista
 * vacía con 200.
 */
async function loadPage(
  scope: { category?: string; storeSlug?: string },
  total: number,
  page: number,
): Promise<{ pageCount: number; products: Product[] } | null> {
  const pageCount = browsePageCount(total);
  if (page < 1 || page > pageCount) return null;

  const { products } = await searchCatalogCached({
    ...scope,
    locale: 'es',
    sort: 'name-asc',
    limit: BROWSE_PAGE_SIZE,
    offset: (page - 1) * BROWSE_PAGE_SIZE,
    withTotal: false,
  });
  if (products.length === 0) return null;
  return { pageCount, products };
}

export const getCategoryBrowsePage = cache(async (
  slug: string,
  page: number,
): Promise<BrowsePageData<CategoryBrowseScope> | null> => {
  if (!hasDatabase()) return null;

  const tree = await loadCategoryTree('es');
  const category = tree.bySlug.get(slug);
  if (!category || category.productCount === 0) return null;
  const parent = category.parentId ? (tree.byId.get(category.parentId) ?? null) : null;

  const result = await loadPage({ category: category.slug }, category.productCount, page);
  if (!result) return null;
  return { scope: { category, parent }, page, total: category.productCount, ...result };
});

export const getStoreBrowsePage = cache(async (
  storeSlug: string,
  page: number,
): Promise<BrowsePageData<StoreNode> | null> => {
  const store = await getStoreNode(storeSlug);
  if (!store) return null;

  const result = await loadPage({ storeSlug: store.slug }, store.productCount, page);
  if (!result) return null;
  return { scope: store, page, total: store.productCount, ...result };
});
