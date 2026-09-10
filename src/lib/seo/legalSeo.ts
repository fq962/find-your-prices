import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { SITE_ROUTES, type SitePage } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { LEGAL_DOCS } from "@/features/legal/legalContent";
import {
  breadcrumbJsonLd,
  contentPageJsonLd,
  graph,
  organizationJsonLd,
  websiteJsonLd,
  type JsonLdNode,
} from "./schema";
import { buildPageMetadata } from "./metadata";

/**
 * SEO de las tres páginas legales.
 *
 * Están juntas porque comparten todo salvo el texto: mismo tipo de página,
 * mismas migas, misma forma de título. Tenerlo seis veces copiado (tres
 * documentos por dos idiomas) era la manera segura de que una de las seis se
 * quedara sin canónica y nadie lo notara.
 *
 * Detalle que sí importa en un comparador: estas páginas se indexan a
 * propósito. Los términos, la privacidad y —sobre todo— la política de uso de
 * contenido son lo que una tienda busca cuando quiere saber con qué criterio
 * aparecen sus datos acá y cómo pedir que se retiren. Esconderlas de los
 * buscadores ahorraría nada y costaría la conversación que evita un problema.
 */

export type LegalDoc = "terms" | "privacy" | "content";

/** Cada documento es también una página del sitio, con su ruta en dos idiomas. */
const DOC_ROUTE: Record<LegalDoc, SitePage> = {
  terms: "terms",
  privacy: "privacy",
  content: "content",
};

/**
 * La descripción sale del `lede` del documento y no de una plantilla: es la
 * frase que ya resume el documento en la propia página, escrita por quien lo
 * redactó. Se le agrega el nombre del sitio porque en la página de resultados
 * "Privacidad" sin contexto no dice de quién.
 */
function description(doc: LegalDoc, locale: Locale): string {
  const lede = LEGAL_DOCS[locale][doc].lede;
  return locale === "es"
    ? `${lede} — ${siteConfig.name}, comparador de precios de ${siteConfig.countryName}.`
    : `${lede} — ${siteConfig.name}, price comparison for ${siteConfig.countryName}.`;
}

export function legalMetadata(doc: LegalDoc, locale: Locale): Metadata {
  return buildPageMetadata({
    locale,
    title: LEGAL_DOCS[locale][doc].title,
    description: description(doc, locale),
    paths: SITE_ROUTES[DOC_ROUTE[doc]],
    // `article` y no `website`: son documentos con autor y fecha, y Open Graph
    // los trata como tales.
    type: "article",
  });
}

export function legalJsonLd(doc: LegalDoc, locale: Locale): JsonLdNode {
  const page = DOC_ROUTE[doc];
  const path = SITE_ROUTES[page][locale];
  const home = SITE_ROUTES.home[locale];

  return graph([
    organizationJsonLd(locale),
    websiteJsonLd(locale),
    contentPageJsonLd({
      type: "WebPage",
      locale,
      path,
      name: LEGAL_DOCS[locale][doc].title,
      description: description(doc, locale),
    }),
    breadcrumbJsonLd([
      { name: locale === "es" ? "Inicio" : "Home", path: home },
      { name: LEGAL_DOCS[locale][doc].title, path },
    ]),
  ]);
}
