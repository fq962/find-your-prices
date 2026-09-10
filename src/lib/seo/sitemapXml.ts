/**
 * Serialización de sitemaps.
 *
 * Next trae la convención `app/sitemap.ts`, que genera un `<urlset>` y ocupa
 * la ruta `/sitemap.xml`. No sirve para este catálogo por una razón concreta:
 * en `/sitemap.xml` hace falta un **índice** (`<sitemapindex>`) que apunte a
 * los demás archivos, y esa convención no sabe emitir índices. Con más de
 * 50 000 fichas el índice no es opcional —es el único modo de partir el
 * catálogo sin pasarse del límite del protocolo.
 *
 * Así que los sitemaps se sirven como route handlers y el XML se arma acá, en
 * un solo lugar y con el escapado hecho a conciencia.
 */

/**
 * Escapa lo que XML no admite dentro de un valor.
 *
 * Importa de verdad: las URLs de las fichas llevan ids nuestros, pero el
 * `hreflang` y las rutas se arman por concatenación, y un `&` sin escapar
 * vuelve el archivo entero inválido —Google lo rechaza completo, no la línea.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type ChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapAlternate {
  hreflang: string;
  href: string;
}

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: ChangeFrequency;
  /** Entre 0 y 1. Es una prioridad *relativa dentro del sitio*, nada más. */
  priority?: number;
  /**
   * Las otras versiones de idioma de esta misma URL. Van en el sitemap y no
   * sólo en el `<head>` porque es la vía por la que Google descubre la
   * correspondencia sin tener que rastrear las dos páginas primero.
   */
  alternates?: SitemapAlternate[];
}

function formatLastmod(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toISOString();
}

/** Un `<urlset>` completo, listo para servir. */
export function renderUrlSet(urls: SitemapUrl[]): string {
  const body = urls
    .map((url) => {
      const parts = [`    <loc>${escapeXml(url.loc)}</loc>`];

      for (const alternate of url.alternates ?? []) {
        parts.push(
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}"/>`,
        );
      }

      if (url.lastmod) {
        const lastmod = formatLastmod(url.lastmod);
        if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      }
      if (url.changefreq) parts.push(`    <changefreq>${url.changefreq}</changefreq>`);
      if (url.priority !== undefined) {
        parts.push(`    <priority>${url.priority.toFixed(1)}</priority>`);
      }

      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;
}

export interface SitemapIndexEntry {
  loc: string;
  lastmod?: string;
}

/** El `<sitemapindex>` que va en `/sitemap.xml`. */
export function renderSitemapIndex(entries: SitemapIndexEntry[]): string {
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) {
        const lastmod = formatLastmod(entry.lastmod);
        if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
      }
      return `  <sitemap>\n${parts.join("\n")}\n  </sitemap>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

/**
 * Respuesta XML con caché.
 *
 * `s-maxage` alto y `stale-while-revalidate` largo porque un sitemap de 10 000
 * fichas cuesta diez consultas a la base y Google lo pide seguido: sin caché,
 * cada visita del rastreador sería una tanda de consultas completa. El
 * contenido tolera estar minutos desactualizado — un artículo nuevo entra al
 * sitemap en la siguiente revalidación, no en el mismo segundo.
 */
export function xmlResponse(body: string, maxAgeSeconds = 3600): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=0, s-maxage=${maxAgeSeconds}, stale-while-revalidate=86400`,
    },
  });
}
