import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import { SITE_ROUTES } from "@/features/i18n/routes";
import type { StoreNode, StorePageData } from "@/server/services/storePages";
import { SITE_KEYWORDS } from "./keywords";
import { buildPageMetadata } from "./metadata";
import type { BreadcrumbItem } from "./schema";

/**
 * SEO de las páginas de tienda.
 *
 * Son las landings de las búsquedas que nombran al comercio —"precios
 * pricesmart honduras", "abarrotes en pricesmart", "televisores diunsa"—.
 * Cada una se titula con la categoría Y la tienda ("Abarrotes en PriceSmart"),
 * que es exactamente la frase que la gente escribe. La tienda no es un filtro
 * sobre la página de categoría: es una página propia, con su URL, su título y
 * sus migas.
 */

/** Las dos rutas de una tienda. El slug es el mismo en ambos idiomas. */
export function storePaths(storeSlug: string): Record<Locale, string> {
  return { es: `/tiendas/${storeSlug}`, en: `/en/stores/${storeSlug}` };
}

/** Las dos rutas de una categoría dentro de una tienda. */
export function storeCategoryPaths(storeSlug: string, categorySlug: string): Record<Locale, string> {
  return {
    es: `/tiendas/${storeSlug}/${categorySlug}`,
    en: `/en/stores/${storeSlug}/${categorySlug}`,
  };
}

/** Las dos rutas del índice de tiendas. */
export function storeIndexPaths(): Record<Locale, string> {
  return SITE_ROUTES.stores;
}

const HOME_LABEL: Record<Locale, string> = { es: "Inicio", en: "Home" };
const INDEX_LABEL: Record<Locale, string> = { es: "Tiendas", en: "Stores" };

/**
 * El H1 y el nombre de la página: "PriceSmart" sola, o "Abarrotes en
 * PriceSmart" con categoría. La concatenación es la palabra clave.
 */
export function storePageHeading(data: Pick<StorePageData, "store" | "category">, locale: Locale): string {
  if (!data.category) return data.store.name;
  return locale === "es"
    ? `${data.category.name} en ${data.store.name}`
    : `${data.category.name} at ${data.store.name}`;
}

export function storePageTitle(data: Pick<StorePageData, "store" | "category">, locale: Locale): string {
  const heading = storePageHeading(data, locale);
  return locale === "es"
    ? `${heading}: precios en ${siteConfig.countryName}`
    : `${heading}: prices in ${siteConfig.countryName}`;
}

function formatCount(count: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "es" ? "es-HN" : "en-US").format(count);
}

/**
 * Descripción del resultado, armada con lo que esta combinación tiene de
 * verdad: cuántos artículos y qué subcategorías. Así no hay dos iguales.
 */
export function storePageDescription(
  data: Pick<StorePageData, "store" | "category" | "children">,
  locale: Locale,
): string {
  const { store, category, children } = data;
  const count = formatCount(category ? category.productCount : store.productCount, locale);
  const topChildren = children
    .slice(0, 3)
    .map((child) => child.name)
    .join(", ");
  const subject = category ? category.name.toLowerCase() : "";

  if (locale === "es") {
    const parts = [
      category
        ? `Precios de ${subject} en ${store.name} (${siteConfig.countryName}): ${count} artículos`
        : `Todos los precios de ${store.name} en ${siteConfig.countryName}: ${count} artículos`,
      "con precio actualizado e historial, comparados con las demás tiendas.",
    ];
    if (topChildren) parts.push(`Incluye ${topChildren}.`);
    return parts.join(" ");
  }

  const parts = [
    category
      ? `${category.name} prices at ${store.name} (${siteConfig.countryName}): ${count} products`
      : `Every ${store.name} price in ${siteConfig.countryName}: ${count} products`,
    "with up-to-date prices and history, compared against other stores.",
  ];
  if (topChildren) parts.push(`Includes ${topChildren}.`);
  return parts.join(" ");
}

export function storePageKeywords(data: Pick<StorePageData, "store" | "category">, locale: Locale): string[] {
  const store = data.store.name.toLowerCase();
  const category = data.category?.name.toLowerCase();
  const derived =
    locale === "es"
      ? category
        ? [
            `${category} ${store}`,
            `${category} en ${store}`,
            `precio de ${category} en ${store}`,
            `${store} ${category} honduras`,
            `${category} ${store} honduras`,
          ]
        : [store, `${store} honduras`, `precios ${store}`, `${store} precios honduras`, `catálogo ${store}`]
      : category
        ? [`${category} ${store}`, `${category} at ${store}`, `${store} ${category} prices`, `${category} ${store} honduras`]
        : [store, `${store} honduras`, `${store} prices`, `${store} catalog`];
  return [...new Set([...derived, ...SITE_KEYWORDS[locale]])];
}

export function storePageMetadata(data: StorePageData, locale: Locale): Metadata {
  const { store, category } = data;
  const images = store.imageUrl
    ? [{ url: store.imageUrl, alt: store.imageAlt ?? store.name, width: 1200, height: 630 }]
    : undefined;

  return buildPageMetadata({
    locale,
    title: storePageTitle(data, locale),
    description: storePageDescription(data, locale),
    paths: category ? storeCategoryPaths(store.slug, category.slug) : storePaths(store.slug),
    keywords: storePageKeywords(data, locale),
    images,
  });
}

export function storeIndexMetadata(locale: Locale, totalProducts: number, totalStores: number): Metadata {
  const count = formatCount(totalProducts, locale);
  return buildPageMetadata({
    locale,
    title:
      locale === "es"
        ? `Tiendas de ${siteConfig.countryName}: precios comparados`
        : `${siteConfig.countryName} stores: prices compared`,
    description:
      locale === "es"
        ? `${totalStores} tiendas de ${siteConfig.countryName} con ${count} artículos, precio actualizado e historial. Entrá a una tienda y buscá por categoría.`
        : `${totalStores} stores in ${siteConfig.countryName} with ${count} products, up-to-date prices and history. Open a store and browse by category.`,
    paths: storeIndexPaths(),
  });
}

/** Migas: Inicio › Tiendas › Tienda › Raíz › Hija. */
export function storeBreadcrumbs(
  data: Pick<StorePageData, "store" | "category" | "parent">,
  locale: Locale,
): BreadcrumbItem[] {
  const { store, category, parent } = data;
  const items: BreadcrumbItem[] = [
    { name: HOME_LABEL[locale], path: SITE_ROUTES.home[locale] },
    { name: INDEX_LABEL[locale], path: storeIndexPaths()[locale] },
    { name: store.name, path: storePaths(store.slug)[locale] },
  ];
  if (parent) items.push({ name: parent.name, path: storeCategoryPaths(store.slug, parent.slug)[locale] });
  if (category) items.push({ name: category.name, path: storeCategoryPaths(store.slug, category.slug)[locale] });
  return items;
}

export type { StoreNode };
