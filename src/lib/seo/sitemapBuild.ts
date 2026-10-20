import "server-only";
import { HREFLANG, absoluteUrl } from "@/lib/seo/metadata";
import { categoryPaths } from "@/lib/seo/categorySeo";
import { storeCategoryPaths, storePaths } from "@/lib/seo/storeSeo";
import {
  productSitemapPath,
  SITEMAP_CATEGORIES_PATH,
  SITEMAP_PAGES_PATH,
  SITEMAP_STORES_PATH,
} from "@/lib/seo/sitemaps";
import {
  renderSitemapIndex,
  renderUrlSet,
  type SitemapIndexEntry,
  type SitemapUrl,
} from "@/lib/seo/sitemapXml";
import { listCategorySlugsForSitemap } from "@/server/services/categoryPages";
import type { SitemapProduct } from "@/server/services/sitemap";
import { listStorePathsForSitemap } from "@/server/services/storePages";

/**
 * El XML de cada sitemap, armado en un solo lugar.
 *
 * Lo usan dos caminos que tienen que dar exactamente lo mismo: el script que
 * deja los archivos hechos en Storage (`scripts/generate-sitemaps.ts`) y las
 * rutas, que los arman al vuelo sólo si el archivo todavía no está. Si cada uno
 * armara su propio XML, el día que divergen Google ve dos sitemaps distintos
 * para la misma URL según quién respondió.
 *
 * Todo lo de acá lanza si la base falla. Un sitemap a medias servido con 200 es
 * peor que un error: Google da por retiradas las URLs que faltan.
 */

/**
 * El índice: páginas fijas, categorías, tiendas y `productChunks` archivos de
 * producto.
 *
 * Sin `lastmod` a propósito. La única fecha que podríamos poner acá es "hace
 * un momento"; un `lastmod` que siempre dice ahora no informa nada y enseña al
 * rastreador a ignorar el campo. La fecha real de cada ficha sí va, y ahí sí
 * significa algo, dentro de cada archivo de producto.
 */
export function sitemapIndexXml(productChunks: number): string {
  const entries: SitemapIndexEntry[] = [
    { loc: absoluteUrl(SITEMAP_PAGES_PATH) },
    { loc: absoluteUrl(SITEMAP_CATEGORIES_PATH) },
    { loc: absoluteUrl(SITEMAP_STORES_PATH) },
  ];

  for (let chunk = 1; chunk <= productChunks; chunk += 1) {
    entries.push({ loc: absoluteUrl(productSitemapPath(chunk)) });
  }

  return renderSitemapIndex(entries);
}

/** Un archivo de producto con las fichas que se le pasan. */
export function productSitemapXml(products: SitemapProduct[]): string {
  const urls: SitemapUrl[] = products.map((product) => {
    // Con slug se lista la dirección legible; sin él —catálogo anterior a la
    // migración 0021— la vieja, que sigue siendo la buena hasta que exista la
    // otra. Nunca las dos: listar una URL que redirige a otra que también está
    // en el archivo le pide a Google que rastree el catálogo dos veces y no
    // indexa ninguna de las dos versiones con claridad.
    const es = product.slug ? `/p/${product.slug}` : `/producto/${product.id}`;

    return {
      loc: absoluteUrl(es),
      // La fecha del último chequeo del scraper. Es un `lastmod` que significa
      // algo: si el precio se revisó ayer, Google sabe que vale la pena volver.
      lastmod: product.lastModified,
      changefreq: "daily" as const,
      priority: 0.7,
    };
  });

  // Sólo la ficha en español, y sin `hreflang`: la inglesa lleva `noindex`
  // (ver `productMetadata`), y anunciarla como alternativa sería mandar al
  // rastreador a una página que se le pide no guardar.
  return renderUrlSet(urls);
}

/**
 * Las páginas de categoría, en los dos idiomas.
 *
 * Solo entran las categorías con artículos comprables —las mismas que la ruta
 * acepta; una vacía responde 404 y listarla sería mandar al rastreador a una
 * puerta cerrada. Las raíces pesan más que las hijas: son las landings de las
 * búsquedas anchas.
 */
export async function categoriesSitemapXml(): Promise<string> {
  const categories = await listCategorySlugsForSitemap();
  // Una lista vacía con base disponible no es un catálogo sin categorías: es
  // una consulta que falló a medias. Mejor un error que borrarlas del índice.
  if (categories.length === 0) throw new Error("El sitemap de categorías salió vacío.");

  const urls: SitemapUrl[] = [];
  for (const category of categories) {
    const paths = categoryPaths(category.slug);
    const alternates = [
      { hreflang: HREFLANG.es, href: absoluteUrl(paths.es) },
      { hreflang: HREFLANG.en, href: absoluteUrl(paths.en) },
      { hreflang: "x-default", href: absoluteUrl(paths.es) },
    ];
    const priority = category.level === 0 ? 0.8 : 0.7;

    for (const locale of ["es", "en"] as const) {
      urls.push({ loc: absoluteUrl(paths[locale]), changefreq: "daily", priority, alternates });
    }
  }

  return renderUrlSet(urls);
}

/**
 * Las landings de tienda, en los dos idiomas: cada tienda y cada categoría
 * que esa tienda vende. Solo combinaciones con artículos —las mismas que la
 * ruta acepta; el resto responde 404 y no se lista.
 */
export async function storesSitemapXml(): Promise<string> {
  const entries = await listStorePathsForSitemap();
  if (entries.length === 0) throw new Error("El sitemap de tiendas salió vacío.");

  const urls: SitemapUrl[] = [];
  for (const entry of entries) {
    const paths = entry.categorySlug
      ? storeCategoryPaths(entry.storeSlug, entry.categorySlug)
      : storePaths(entry.storeSlug);
    const alternates = [
      { hreflang: HREFLANG.es, href: absoluteUrl(paths.es) },
      { hreflang: HREFLANG.en, href: absoluteUrl(paths.en) },
      { hreflang: "x-default", href: absoluteUrl(paths.es) },
    ];
    // La tienda pesa más que sus categorías raíz, y éstas más que las hijas.
    const priority = entry.categorySlug === null ? 0.8 : entry.level === 0 ? 0.7 : 0.6;

    for (const locale of ["es", "en"] as const) {
      urls.push({ loc: absoluteUrl(paths[locale]), changefreq: "daily", priority, alternates });
    }
  }

  return renderUrlSet(urls);
}
