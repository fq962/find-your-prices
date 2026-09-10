import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import { formatPrice } from "@/lib/format";
import type { ProductDetail } from "@/server/services/catalog";
import type { BreadcrumbItem } from "./schema";
import { productKeywords } from "./keywords";
import { buildPageMetadata } from "./metadata";

/**
 * SEO de las fichas de producto.
 *
 * Son decenas de miles de páginas y son, de lejos, la mayor superficie de
 * búsqueda del sitio: nadie llega a un comparador buscando "comparador", llega
 * buscando "precio freidora de aire honduras". Todo lo que decide cómo se ve
 * esa ficha en Google se define acá, una vez, y no en cada una de las dos
 * rutas de idioma.
 */

/** Las dos rutas de una misma ficha. El id es el mismo en ambos idiomas. */
export function productPaths(id: string): Record<Locale, string> {
  return { es: `/producto/${id}`, en: `/en/product/${id}` };
}

const INTL_LOCALE: Record<Locale, string> = { es: "es-HN", en: "en-HN" };

/**
 * Título del resultado de búsqueda.
 *
 * Lleva el precio a propósito. Es lo primero que quiere saber quien busca un
 * producto, y un título que ya lo responde gana el clic contra cinco
 * resultados que sólo repiten el nombre del artículo. Que el precio cambie no
 * es problema: la página se revalida cada diez minutos y Google vuelve a
 * leerla.
 */
function productTitle(product: ProductDetail, locale: Locale): string {
  const price = formatPrice(product.price, product.currency, INTL_LOCALE[locale]);
  const at = locale === "es" ? "en" : "at";
  return `${product.name} — ${price} ${at} ${product.store}`;
}

/**
 * Descripción del resultado.
 *
 * Se arma con lo que esta ficha tiene y no con una plantilla fija: la marca si
 * existe, el descuento si lo hay, la disponibilidad tal como está. Cincuenta
 * mil descripciones idénticas salvo el nombre del producto son contenido
 * duplicado, y Google deja de mostrarlas.
 */
function productDescription(product: ProductDetail, locale: Locale): string {
  const price = formatPrice(product.price, product.currency, INTL_LOCALE[locale]);
  const parts: string[] = [];

  if (locale === "es") {
    parts.push(`${product.name} a ${price} en ${product.store}, ${siteConfig.countryName}.`);
    if (product.discountPercent && product.discountPercent > 0) {
      parts.push(`Rebajado ${Math.round(product.discountPercent)} %.`);
    }
    if (product.brand) parts.push(`Marca ${product.brand}.`);
    if (product.availability) parts.push(`${product.availability}.`);
    parts.push("Compará el precio con otras tiendas y mirá su historial en Find Your Prices.");
  } else {
    parts.push(`${product.name} for ${price} at ${product.store}, ${siteConfig.countryName}.`);
    if (product.discountPercent && product.discountPercent > 0) {
      parts.push(`${Math.round(product.discountPercent)}% off.`);
    }
    if (product.brand) parts.push(`Brand: ${product.brand}.`);
    if (product.availability) parts.push(`${product.availability}.`);
    parts.push("Compare it with other stores and see its price history on Find Your Prices.");
  }

  // Google recorta la descripción alrededor de los 160 caracteres, pero recorta
  // por palabra completa; pasarse un poco es preferible a dejar fuera el dato
  // que importa. El corte duro es para que no se vaya a un párrafo entero.
  const text = parts.join(" ");
  return text.length > 300 ? `${text.slice(0, 297).trimEnd()}…` : text;
}

/**
 * Imagen de vista previa: la foto del producto.
 *
 * Gana a cualquier tarjeta de marca generada — quien recibe el enlace quiere
 * ver el artículo. Si la tienda no publicó foto, no se declara nada y la ficha
 * hereda la tarjeta de marca del segmento, que es el respaldo correcto.
 */
function productImages(product: ProductDetail) {
  const url = product.images.find((image) => image.isPrimary)?.url ?? product.imageUrl;
  if (!url) return undefined;
  return [{ url, alt: product.name }];
}

/** Metadata completa de una ficha. */
export function productMetadata(
  product: ProductDetail,
  locale: Locale,
  id: string,
): Metadata {
  return buildPageMetadata({
    locale,
    title: productTitle(product, locale),
    description: productDescription(product, locale),
    paths: productPaths(id),
    keywords: productKeywords(
      {
        name: product.name,
        brand: product.brand,
        model: product.model,
        category: product.category,
        store: product.store,
        sku: product.sku,
      },
      locale,
    ),
    images: productImages(product),
    type: "product",
  });
}

/**
 * Metadata de una ficha que ya no existe.
 *
 * `noindex` no es un detalle: sin él, Google conserva en el índice una página
 * que responde 404 y la muestra en resultados durante semanas. Peor todavía en
 * un catálogo donde los artículos se retiran a diario.
 */
export function missingProductMetadata(locale: Locale): Metadata {
  return {
    title: locale === "es" ? "Producto no encontrado" : "Product not found",
    description:
      locale === "es"
        ? "Este artículo ya no está disponible en el catálogo."
        : "This item is no longer available in the catalog.",
    robots: { index: false, follow: true },
  };
}

/**
 * Migas de pan de una ficha: inicio › categoría › producto.
 *
 * La categoría no tiene página propia todavía, así que apunta a la portada.
 * Cuando existan páginas de categoría, éste es el único lugar que hay que
 * tocar para que las migas apunten a ellas.
 */
export function productBreadcrumbs(
  product: ProductDetail,
  locale: Locale,
  id: string,
): BreadcrumbItem[] {
  const home = locale === "es" ? "/" : "/en";
  return [
    { name: locale === "es" ? "Inicio" : "Home", path: home },
    { name: product.category, path: home },
    { name: product.name, path: productPaths(id)[locale] },
  ];
}
