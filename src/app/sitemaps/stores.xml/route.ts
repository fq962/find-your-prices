import { HREFLANG, absoluteUrl } from "@/lib/seo/metadata";
import { storeCategoryPaths, storePaths } from "@/lib/seo/storeSeo";
import { renderUrlSet, xmlResponse, type SitemapUrl } from "@/lib/seo/sitemapXml";
import { listStorePathsForSitemap } from "@/server/services/storePages";

/**
 * Sitemap de las landings de tienda, en los dos idiomas: cada tienda y cada
 * categoría que esa tienda vende. Solo combinaciones con artículos —las
 * mismas que la ruta acepta; el resto responde 404 y no se lista.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const entries = await listStorePathsForSitemap();
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

  return xmlResponse(renderUrlSet(urls), 3600);
}
