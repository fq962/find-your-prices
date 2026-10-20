import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { Product } from "@/types";
import { buildPageMetadata } from "./metadata";

/**
 * SEO de los listados paginados "todos los productos" (ver
 * `server/services/browsePages.ts`).
 *
 * No compiten con la landing por ninguna búsqueda: su trabajo es que el
 * rastreador llegue a cada ficha. Aun así se indexan —con canónica propia, que
 * es lo que Google pide para una serie paginada— porque un `noindex` sostenido
 * termina tratándose como `nofollow`, y entonces dejarían de servir para lo
 * único que tienen que hacer.
 */

export interface BrowseSeoInput {
  /** De qué es la lista: "Televisores", "PriceSmart". */
  subject: string;
  page: number;
  pageCount: number;
  total: number;
  products: Pick<Product, "name">[];
  path: string;
  /** La landing en inglés, para el selector de idioma: este listado no tiene versión inglesa. */
  enPath: string;
}

export function browseHeading(subject: string): string {
  return `${subject}: todos los productos`;
}

export function browsePageLabel(page: number, pageCount: number): string {
  return `Página ${page} de ${pageCount}`;
}

/**
 * Título y descripción llevan el número de página y el primer y último
 * artículo: es lo que hace que cientos de páginas de la misma serie no tengan
 * todas el mismo resultado de búsqueda.
 */
export function browseMetadata(input: BrowseSeoInput): Metadata {
  const { subject, page, pageCount, total, products, path, enPath } = input;
  const count = new Intl.NumberFormat("es-HN").format(total);
  const first = products[0]?.name;
  const last = products[products.length - 1]?.name;
  const range = first && last && first !== last ? ` Desde «${first}» hasta «${last}».` : "";

  return buildPageMetadata({
    locale: "es",
    title: `${browseHeading(subject)} (${browsePageLabel(page, pageCount).toLowerCase()})`,
    description: `Los ${count} artículos de ${subject} en ${siteConfig.countryName}, de la A a la Z: ${browsePageLabel(page, pageCount).toLowerCase()}.${range} Precio actualizado e historial de cada uno.`,
    paths: { es: path, en: enPath },
    hreflang: false,
  });
}
