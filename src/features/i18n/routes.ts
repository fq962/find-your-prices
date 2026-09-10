import type { Locale } from "./translate";

/**
 * Rutas del sitio en los dos idiomas, en un solo lugar.
 *
 * Cada idioma tiene su propia URL legible —"/terminos" y "/en/terms", no
 * "/terms?lang=es"—, así que la correspondencia entre ambas versiones de una
 * misma página no se puede deducir del pathname. Tenerla acá es lo que permite
 * que el selector de idioma lleve a la MISMA página en el otro idioma en vez de
 * devolver a la portada, y que cada ruta declare sus `alternates` de idioma
 * para los buscadores.
 */

export type SitePage = "home" | "about" | "terms" | "privacy" | "content";

export const SITE_ROUTES: Record<SitePage, Record<Locale, string>> = {
  home: { es: "/", en: "/en" },
  about: { es: "/acerca", en: "/en/about" },
  terms: { es: "/terminos", en: "/en/terms" },
  privacy: { es: "/privacidad", en: "/en/privacy" },
  content: { es: "/uso-de-contenido", en: "/en/content-use" },
};

export function routeFor(page: SitePage, locale: Locale): string {
  return SITE_ROUTES[page][locale];
}

/** Las dos URLs de una misma página, como las quiere `alternates.languages`. */
export function alternatesFor(page: SitePage): Record<Locale, string> {
  return SITE_ROUTES[page];
}
