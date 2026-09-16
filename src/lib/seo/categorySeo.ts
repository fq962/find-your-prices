import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import { SITE_ROUTES } from "@/features/i18n/routes";
import type { CategoryNode, CategoryPageData } from "@/server/services/categoryPages";
import { SITE_KEYWORDS } from "./keywords";
import { buildPageMetadata } from "./metadata";
import type { BreadcrumbItem } from "./schema";

/**
 * SEO de las páginas de categoría.
 *
 * Son las landings de las búsquedas anchas —"precio de televisores en
 * honduras", "herramientas eléctricas honduras"— que ninguna ficha responde.
 * Todo lo que decide cómo se ven en Google sale de acá: el título, la
 * descripción, las palabras clave y las migas. Lo editable (texto, imagen)
 * vive en la base y lo mantiene el panel; acá solo se decide el fallback
 * cuando todavía no se escribió nada.
 */

/** Las dos rutas de una misma categoría. El slug es el mismo en ambos idiomas. */
export function categoryPaths(slug: string): Record<Locale, string> {
  return { es: `/categorias/${slug}`, en: `/en/categories/${slug}` };
}

/** Las dos rutas del índice de categorías. */
export function categoryIndexPaths(): Record<Locale, string> {
  return SITE_ROUTES.categories;
}

const HOME_LABEL: Record<Locale, string> = { es: "Inicio", en: "Home" };
const INDEX_LABEL: Record<Locale, string> = { es: "Categorías", en: "Categories" };

/**
 * Título del resultado. Con texto editorial se usa tal cual; sin él, la
 * fórmula que responde a la intención de búsqueda: qué, dónde y qué gano.
 */
export function categoryTitle(category: CategoryNode, locale: Locale): string {
  if (category.content.title) return category.content.title;
  return locale === "es"
    ? `${category.name}: precios en ${siteConfig.countryName}`
    : `${category.name}: prices in ${siteConfig.countryName}`;
}

function formatCount(count: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "es" ? "es-HN" : "en-US").format(count);
}

/**
 * Descripción del resultado. La editorial manda; sin ella se arma con lo
 * que esta categoría tiene de verdad —cuántos artículos, cuántas tiendas—
 * para que no haya dos descripciones iguales en el sitio.
 */
export function categoryDescription(
  data: Pick<CategoryPageData, "category" | "facets" | "children">,
  locale: Locale,
): string {
  const { category, facets, children } = data;
  if (category.content.metaDescription) return category.content.metaDescription;

  const count = formatCount(category.productCount, locale);
  const stores = facets.stores.length;
  const topChildren = children
    .slice(0, 3)
    .map((child) => child.name)
    .join(", ");

  if (locale === "es") {
    const parts = [
      `Compará precios de ${category.name.toLowerCase()} en ${siteConfig.countryName}: ${count} artículos`,
      stores > 0 ? `de ${stores} tiendas` : "",
      "con precio actualizado e historial.",
    ];
    if (topChildren) parts.push(`Incluye ${topChildren}.`);
    return parts.filter(Boolean).join(" ");
  }

  const parts = [
    `Compare ${category.name.toLowerCase()} prices in ${siteConfig.countryName}: ${count} products`,
    stores > 0 ? `from ${stores} stores` : "",
    "with up-to-date prices and history.",
  ];
  if (topChildren) parts.push(`Includes ${topChildren}.`);
  return parts.filter(Boolean).join(" ");
}

/**
 * Palabras clave: las editoriales si existen, y siempre las que se derivan
 * del nombre (la categoría, "precio de", el país) más las del sitio.
 */
export function categoryKeywords(category: CategoryNode, locale: Locale): string[] {
  const name = category.name.toLowerCase();
  const derived =
    locale === "es"
      ? [
          name,
          `${name} honduras`,
          `precio de ${name}`,
          `precios de ${name} en honduras`,
          `comprar ${name} honduras`,
          `${name} baratos`,
        ]
      : [name, `${name} honduras`, `${name} prices`, `${name} prices in honduras`, `buy ${name} honduras`];
  return [...new Set([...category.content.keywords, ...derived, ...SITE_KEYWORDS[locale]])];
}

export function categoryMetadata(data: CategoryPageData, locale: Locale): Metadata {
  const { category } = data;
  const images = category.imageUrl
    ? [{ url: category.imageUrl, alt: category.imageAlt ?? category.name, width: 1200, height: 630 }]
    : undefined;

  return buildPageMetadata({
    locale,
    title: categoryTitle(category, locale),
    description: categoryDescription(data, locale),
    paths: categoryPaths(category.slug),
    keywords: categoryKeywords(category, locale),
    images,
  });
}

export function categoryIndexMetadata(locale: Locale, totalProducts: number): Metadata {
  const count = formatCount(totalProducts, locale);
  return buildPageMetadata({
    locale,
    title:
      locale === "es"
        ? `Todas las categorías: precios en ${siteConfig.countryName}`
        : `All categories: prices in ${siteConfig.countryName}`,
    description:
      locale === "es"
        ? `Explorá el catálogo por categoría: ${count} artículos de las tiendas de ${siteConfig.countryName}, con precio actualizado e historial. Encontrá dónde está más barato.`
        : `Browse the catalog by category: ${count} products from ${siteConfig.countryName}'s stores, with up-to-date prices and history. Find where it's cheapest.`,
    paths: categoryIndexPaths(),
  });
}

/** Migas: Inicio › Categorías › Raíz › Hija. */
export function categoryBreadcrumbs(
  category: CategoryNode,
  parent: CategoryNode | null,
  locale: Locale,
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    { name: HOME_LABEL[locale], path: SITE_ROUTES.home[locale] },
    { name: INDEX_LABEL[locale], path: categoryIndexPaths()[locale] },
  ];
  if (parent) items.push({ name: parent.name, path: categoryPaths(parent.slug)[locale] });
  items.push({ name: category.name, path: categoryPaths(category.slug)[locale] });
  return items;
}
