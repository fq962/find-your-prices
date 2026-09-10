import { SITE_ROUTES, type SitePage } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { absoluteUrl, HREFLANG } from "@/lib/seo/metadata";
import {
  renderUrlSet,
  xmlResponse,
  type ChangeFrequency,
  type SitemapUrl,
} from "@/lib/seo/sitemapXml";

/**
 * Sitemap de las páginas fijas: portada, "Acerca de" y las tres legales.
 *
 * Son diez URLs —cinco páginas por dos idiomas— y no tocan la base de datos,
 * así que se sirven aparte de las fichas: mezclarlas en el mismo archivo que
 * 50 000 productos haría que la portada se re-descubra a la velocidad del
 * catálogo, que es la más lenta de las dos.
 */
export const revalidate = 86_400;

/**
 * Con qué frecuencia cambia cada página y cuánto pesa dentro del sitio.
 *
 * `changefreq` y `priority` son sugerencias que Google dice ignorar; Bing y
 * Yandex sí las miran. Cuestan una línea y no hacen daño, siempre que digan la
 * verdad: la portada cambia cada vez que corre el scraper, los términos de uso
 * cambian cuando alguien los edita, que es casi nunca.
 */
const PAGE_HINTS: Record<SitePage, { changefreq: ChangeFrequency; priority: number }> = {
  home: { changefreq: "hourly", priority: 1 },
  about: { changefreq: "monthly", priority: 0.6 },
  terms: { changefreq: "yearly", priority: 0.3 },
  privacy: { changefreq: "yearly", priority: 0.3 },
  content: { changefreq: "yearly", priority: 0.4 },
};

const LOCALES: Locale[] = ["es", "en"];

export function GET(): Response {
  const urls: SitemapUrl[] = [];

  for (const page of Object.keys(PAGE_HINTS) as SitePage[]) {
    const paths = SITE_ROUTES[page];

    // Las alternativas se calculan una vez por página y se repiten idénticas en
    // las dos entradas. Es lo que pide Google: cada versión de idioma se lista
    // como su propia <url> y declara el juego completo de alternativas,
    // incluida ella misma. Un `hreflang` que no es recíproco se descarta.
    const alternates = [
      { hreflang: HREFLANG.es, href: absoluteUrl(paths.es) },
      { hreflang: HREFLANG.en, href: absoluteUrl(paths.en) },
      { hreflang: "x-default", href: absoluteUrl(paths.es) },
    ];

    for (const locale of LOCALES) {
      urls.push({
        loc: absoluteUrl(paths[locale]),
        changefreq: PAGE_HINTS[page].changefreq,
        priority: PAGE_HINTS[page].priority,
        alternates,
      });
    }
  }

  return xmlResponse(renderUrlSet(urls), 86_400);
}
