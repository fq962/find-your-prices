import { HREFLANG, absoluteUrl } from "@/lib/seo/metadata";
import { categoryPaths } from "@/lib/seo/categorySeo";
import { renderUrlSet, xmlResponse, type SitemapUrl } from "@/lib/seo/sitemapXml";
import { listCategorySlugsForSitemap } from "@/server/services/categoryPages";

/**
 * Sitemap de las páginas de categoría, en los dos idiomas.
 *
 * Solo entran las categorías con artículos comprables —las mismas que la
 * ruta acepta; una vacía responde 404 y listarla sería mandar al rastreador
 * a una puerta cerrada. Las raíces pesan más que las hijas: son las landings
 * de las búsquedas anchas.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const categories = await listCategorySlugsForSitemap();
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
      urls.push({
        loc: absoluteUrl(paths[locale]),
        changefreq: "daily",
        priority,
        alternates,
      });
    }
  }

  return xmlResponse(renderUrlSet(urls), 3600);
}
