import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { SITE_ROUTES } from '@/features/i18n/routes';
import {
  SITEMAP_CATEGORIES_PATH,
  SITEMAP_INDEX_PATH,
  SITEMAP_PAGES_PATH,
  SITEMAP_STORES_PATH,
} from '@/lib/seo/sitemaps';
import { CATALOG_SEARCH_CACHE_TAG } from './catalog';

/**
 * Los cachés que el panel puede tirar a mano, agrupados por lo que la
 * persona quiere ver refrescado. Es la versión con botones de
 * `/api/revalidate`: la misma operación, sin tener que armar la URL con el
 * secreto.
 *
 * Qué hay en caché y cuánto dura:
 *   - Data cache (etiqueta `catalog-search`, 5 min): búsquedas, sugerencias,
 *     facetas, el árbol de categorías y las filas de tiendas.
 *   - ISR por ruta: portada (5 min), categorías, tiendas y sitemaps (1 h),
 *     fichas (10 min).
 *
 * Con `revalidatePath` sobre una ruta dinámica (`/categorias/[slug]`) se
 * tiran TODAS las páginas de esa ruta, que es lo que se quiere cuando cambió
 * el árbol o una imagen. Las fichas no entran: son decenas de miles y
 * caducan solas.
 */

export type CacheScope = 'catalog' | 'categories' | 'stores' | 'sitemaps' | 'all';

export interface CacheScopeInfo {
  scope: CacheScope;
  label: string;
  description: string;
}

export const CACHE_SCOPES: CacheScopeInfo[] = [
  {
    scope: 'catalog',
    label: 'Catálogo y portada',
    description:
      'Búsquedas, sugerencias del buscador, facetas y las dos portadas. Después de un scraping o de mapear categorías.',
  },
  {
    scope: 'categories',
    label: 'Páginas de categoría',
    description:
      'El índice y todas las landings de categoría en los dos idiomas, más el árbol en caché. Después de editar imagen o texto.',
  },
  {
    scope: 'stores',
    label: 'Páginas de tienda',
    description:
      'El índice, cada tienda y cada tienda × categoría, más las filas de tiendas en caché. Después de subir un logo.',
  },
  {
    scope: 'sitemaps',
    label: 'Sitemaps',
    description: 'El índice y los sitemaps de páginas, categorías y tiendas. Después de crear o quitar landings.',
  },
  {
    scope: 'all',
    label: 'Todo lo anterior',
    description: 'Los cuatro grupos de una vez. Las fichas de producto no entran: caducan solas cada diez minutos.',
  },
];

const CATEGORY_ROUTES = [
  ...Object.values(SITE_ROUTES.categories),
  '/categorias/[slug]',
  '/en/categories/[slug]',
];

const STORE_ROUTES = [
  ...Object.values(SITE_ROUTES.stores),
  '/tiendas/[store]',
  '/tiendas/[store]/[slug]',
  '/en/stores/[store]',
  '/en/stores/[store]/[slug]',
];

const SITEMAP_ROUTES = [
  SITEMAP_INDEX_PATH,
  SITEMAP_PAGES_PATH,
  SITEMAP_CATEGORIES_PATH,
  SITEMAP_STORES_PATH,
];

/** Rutas que se tiran por alcance. Las dinámicas van con su patrón. */
function pathsFor(scope: CacheScope): Array<{ path: string; type?: 'page' }> {
  switch (scope) {
    case 'catalog':
      return Object.values(SITE_ROUTES.home).map((path) => ({ path }));
    case 'categories':
      return CATEGORY_ROUTES.map((path) => ({ path, type: path.includes('[') ? 'page' : undefined }));
    case 'stores':
      return STORE_ROUTES.map((path) => ({ path, type: path.includes('[') ? 'page' : undefined }));
    case 'sitemaps':
      return SITEMAP_ROUTES.map((path) => ({ path }));
    case 'all':
      return (['catalog', 'categories', 'stores', 'sitemaps'] as const).flatMap(pathsFor);
  }
}

export function isCacheScope(value: string): value is CacheScope {
  return CACHE_SCOPES.some((info) => info.scope === value);
}

/** Tira los cachés del alcance. Devuelve qué se tiró, para mostrarlo. */
export function refreshCache(scope: CacheScope): { paths: string[]; tags: string[] } {
  const entries = pathsFor(scope);
  for (const entry of entries) {
    if (entry.type) revalidatePath(entry.path, entry.type);
    else revalidatePath(entry.path);
  }
  // La etiqueta del catálogo cubre las búsquedas y también el árbol y las
  // tiendas en caché: cualquier alcance la tira, porque una página
  // regenerada con datos viejos del data cache sería refrescar en vano.
  revalidateTag(CATALOG_SEARCH_CACHE_TAG, 'max');
  return { paths: entries.map((entry) => entry.path), tags: [CATALOG_SEARCH_CACHE_TAG] };
}
