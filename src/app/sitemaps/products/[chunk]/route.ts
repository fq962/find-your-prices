import { absoluteUrl, HREFLANG } from "@/lib/seo/metadata";
import { renderUrlSet, xmlResponse, type SitemapUrl } from "@/lib/seo/sitemapXml";
import { countSitemapProducts, getSitemapProducts, sitemapChunkCount } from "@/server/services/sitemap";

/**
 * Un archivo de sitemap por tanda de fichas: `/sitemaps/products/1.xml`.
 *
 * El catálogo pasa de 50 000 artículos, que es justo el límite de URLs por
 * archivo del protocolo. Partirlo no es una optimización: un `<urlset>` con
 * más de 50 000 entradas lo rechaza Google entero, no de la 50 001 en adelante.
 *
 * El índice (`/sitemap.xml`) es el que decide cuántas tandas hay; acá sólo se
 * sirve la que piden.
 */
export const revalidate = 3600;

interface RouteContext {
  params: Promise<{ chunk: string }>;
}

/**
 * El segmento llega como `"3.xml"`.
 *
 * La extensión va en el nombre del archivo y no en la carpeta porque un
 * sitemap tiene que verse como un `.xml` desde la URL: hay rastreadores que
 * miran la extensión antes que el `Content-Type`, y Search Console lo espera
 * así. El precio es tener que quitarla acá.
 */
function parseChunk(raw: string): number | null {
  const match = /^(\d+)\.xml$/.exec(raw);
  if (!match) return null;
  const chunk = Number(match[1]);
  return Number.isInteger(chunk) && chunk >= 1 ? chunk : null;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { chunk: raw } = await context.params;
  const chunk = parseChunk(raw);

  // 404 y no un archivo vacío: un sitemap válido pero sin URLs le dice a Google
  // que esas fichas se retiraron, y las saca del índice. No encontrarlo es la
  // respuesta correcta a una tanda que no existe.
  if (chunk === null) return new Response("Not found", { status: 404 });

  const total = await countSitemapProducts();
  if (chunk > sitemapChunkCount(total)) {
    return new Response("Not found", { status: 404 });
  }

  const products = await getSitemapProducts(chunk);
  if (products.length === 0) return new Response("Not found", { status: 404 });

  const urls: SitemapUrl[] = products.map((product) => {
    // Con slug se lista la dirección legible; sin él —catálogo anterior a la
    // migración 0021— la vieja, que sigue siendo la buena hasta que exista la
    // otra. Nunca las dos: listar una URL que redirige a otra que también está
    // en el archivo le pide a Google que rastree el catálogo dos veces y no
    // indexa ninguna de las dos versiones con claridad.
    const es = product.slug ? `/p/${product.slug}` : `/producto/${product.id}`;
    const en = product.slug ? `/en/p/${product.slug}` : `/en/product/${product.id}`;

    return {
      loc: absoluteUrl(es),
      // La fecha del último chequeo del scraper. Es un `lastmod` que significa
      // algo: si el precio se revisó ayer, Google sabe que vale la pena volver.
      lastmod: product.lastModified,
      changefreq: "daily" as const,
      priority: 0.7,
      alternates: [
        { hreflang: HREFLANG.es, href: absoluteUrl(es) },
        { hreflang: HREFLANG.en, href: absoluteUrl(en) },
        { hreflang: "x-default", href: absoluteUrl(es) },
      ],
    };
  });

  // Sólo se lista la URL en español como `<loc>`; la inglesa entra como
  // alternativa. Listar las dos duplicaría el archivo —100 000 entradas para
  // 50 000 fichas— sin agregar una sola página que Google no vaya a descubrir
  // igual por el `hreflang`.
  return xmlResponse(renderUrlSet(urls));
}
