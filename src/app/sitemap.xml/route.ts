import { absoluteUrl } from "@/lib/seo/metadata";
import {
  productSitemapPath,
  SITEMAP_PAGES_PATH,
} from "@/lib/seo/sitemaps";
import {
  renderSitemapIndex,
  xmlResponse,
  type SitemapIndexEntry,
} from "@/lib/seo/sitemapXml";
import { countSitemapProducts, sitemapChunkCount } from "@/server/services/sitemap";

/**
 * Índice de sitemaps: `https://findyourprices.com/sitemap.xml`.
 *
 * Es la única dirección que hay que dar de alta en Search Console y la única
 * que declara `robots.txt`. Desde acá cuelgan el archivo de páginas fijas y
 * tantos archivos de producto como haga falta.
 *
 * Está escrito como route handler y no con la convención `app/sitemap.ts`
 * porque esa convención sólo sabe emitir `<urlset>`, y lo que va en la raíz de
 * un catálogo de este tamaño es un `<sitemapindex>`.
 *
 * Se regenera cada hora. El catálogo crece de a poco; lo que cambia seguido
 * son los precios, y eso no altera qué URLs existen.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const total = await countSitemapProducts();
  const chunks = sitemapChunkCount(total);

  const entries: SitemapIndexEntry[] = [{ loc: absoluteUrl(SITEMAP_PAGES_PATH) }];

  for (let chunk = 1; chunk <= chunks; chunk += 1) {
    entries.push({ loc: absoluteUrl(productSitemapPath(chunk)) });
  }

  // Sin `lastmod` a propósito. La única fecha que podríamos poner acá es "hace
  // un momento", porque el índice se genera al vuelo; un `lastmod` que siempre
  // dice ahora no informa nada y enseña al rastreador a ignorar el campo. La
  // fecha real de cada ficha sí va, y ahí sí significa algo, dentro de cada
  // archivo de producto.
  return xmlResponse(renderSitemapIndex(entries));
}
