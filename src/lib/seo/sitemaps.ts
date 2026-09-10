import { SITEMAP_CHUNK_SIZE } from "@/server/services/sitemap";

/**
 * Direcciones de los sitemaps, en un solo lugar.
 *
 * Las usan el índice, el `robots.txt` y los propios archivos. Tenerlas
 * duplicadas era el modo obvio de que el índice apuntara a una ruta que ya no
 * existe y Google se quedara sin catálogo sin avisar a nadie.
 */

/** El índice. Es lo único que hay que darle a Search Console. */
export const SITEMAP_INDEX_PATH = "/sitemap.xml";

/** Portada y páginas de texto, en los dos idiomas. Un solo archivo, chico. */
export const SITEMAP_PAGES_PATH = "/sitemaps/pages.xml";

/** Un archivo por tanda de fichas. Base 1: el primero es `products/1.xml`. */
export function productSitemapPath(chunk: number): string {
  return `/sitemaps/products/${chunk}.xml`;
}

export { SITEMAP_CHUNK_SIZE };
