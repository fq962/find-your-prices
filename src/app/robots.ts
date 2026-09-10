import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { absoluteUrl } from "@/lib/seo/metadata";
import { SITEMAP_INDEX_PATH } from "@/lib/seo/sitemaps";

/**
 * `robots.txt`.
 *
 * Lo que se cierra y por qué:
 *
 * - `/admin` es el panel de scraping. Hoy está abierto —falta OAuth— y no
 *   tiene nada que hacer en un buscador. Va además con `noindex` en su propia
 *   metadata, que es lo que de verdad lo saca del índice: `robots.txt` impide
 *   rastrear, no indexar, y una URL bloqueada acá igual puede aparecer en los
 *   resultados si alguien la enlaza desde fuera.
 * - `/api` son endpoints JSON. Rastrearlos gasta presupuesto de rastreo en
 *   respuestas que ninguna persona va a leer.
 *
 * Todo lo demás se abre a propósito, incluidas las decenas de miles de fichas
 * de producto: son el motivo por el que este sitio existe en la búsqueda.
 *
 * Nota para más adelante: si alguna vez se decide no alimentar modelos de IA
 * con el catálogo, el lugar es acá, con una regla aparte para `GPTBot`,
 * `CCBot`, `ClaudeBot` y `Google-Extended` (esta última es la palanca de
 * entrenamiento de Google y bloquearla no afecta al rastreo de Búsqueda). Se
 * deja sin bloquear porque es una decisión de producto, no de SEO.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: absoluteUrl(SITEMAP_INDEX_PATH),
    host: siteConfig.url,
  };
}
