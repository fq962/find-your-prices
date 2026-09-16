import type { Locale } from "@/features/i18n/translate";

/**
 * Textos fijos de las páginas de categoría, por idioma.
 *
 * Viven acá y no en el diccionario porque estas páginas son Server
 * Components: no hay `useLocale`, la ruta ya sabe el idioma y lo pasa. Lo
 * editorial (intro, cuerpo, palabras clave de CADA categoría) no está acá:
 * vive en la base y lo mantiene el panel. Lo de acá es el andamio y el texto
 * de respaldo para una categoría a la que todavía no se le escribió nada.
 */
export interface CategoryCopy {
  breadcrumbs: string;
  indexEyebrow: string;
  indexTitle: string;
  indexNative: string;
  indexTagline: (products: string, categories: number) => string;
  featuredHeading: string;
  allHeading: string;
  allSub: string;
  productsCount: (count: string) => string;
  subcategoriesCount: (count: number) => string;
  popularSubHeading: (name: string) => string;
  popularProductsHeading: string;
  popularProductsSub: string;
  browseSubHeading: string;
  alsoInHeading: (parent: string) => string;
  searchHeading: (name: string) => string;
  searchSub: (name: string) => string;
  aboutHeading: (name: string) => string;
  defaultIntro: (name: string, products: string, stores: number) => string;
  defaultBody: (name: string, children: string[]) => string;
}

const STORES_LINE = "Diunsa, Walmart, Jetstereo, RadioShack, ACOSA, Lady Lee, PriceSmart";

export const CATEGORY_COPY: Record<Locale, CategoryCopy> = {
  es: {
    breadcrumbs: "Ubicación",
    indexEyebrow: "Catálogo por categoría",
    indexTitle: "Todas las categorías",
    indexNative: "Buscá por lo que necesitás",
    indexTagline: (products, categories) =>
      `${products} artículos de las tiendas de Honduras, ordenados en ${categories} categorías. Elegí una y compará precios.`,
    featuredHeading: "Categorías populares",
    allHeading: "Comprar por categoría",
    allSub: "Todo el catálogo, de la A a la Z.",
    productsCount: (count) => `${count} artículos`,
    subcategoriesCount: (count) => (count === 1 ? "1 subcategoría" : `${count} subcategorías`),
    popularSubHeading: (name) => `${name}: lo más buscado`,
    popularProductsHeading: "Productos populares",
    popularProductsSub: "Lo que más abren las personas que llegan a esta categoría.",
    browseSubHeading: "Comprar por subcategoría",
    alsoInHeading: (parent) => `También en ${parent}`,
    searchHeading: (name) => `Buscá en ${name}`,
    searchSub: (name) =>
      `Filtrá ${name.toLowerCase()} por tienda, marca y precio. Todo el catálogo de esta categoría, con precio actualizado.`,
    aboutHeading: (name) => `${name} en Honduras`,
    defaultIntro: (name, products, stores) =>
      `Compará precios de ${name.toLowerCase()} en ${stores} tiendas de Honduras. ${products} artículos con precio actualizado varias veces al día y su historial, para saber si la oferta es real.`,
    defaultBody: (name, children) => {
      const lower = name.toLowerCase();
      const parts = [
        `## Dónde comprar ${lower} al mejor precio`,
        `Find Your Prices reúne en un solo lugar los precios de ${lower} publicados por las tiendas de Honduras: ${STORES_LINE} y más. Cada artículo muestra el precio vigente, el descuento cuando lo hay y el historial, así podés ver si el "precio de oferta" de hoy es el mismo de hace un mes.`,
      ];
      if (children.length > 0) {
        parts.push(
          `## Qué incluye esta categoría`,
          `Acá encontrás ${children.slice(0, 6).join(", ")}${children.length > 6 ? " y más" : ""}. Cada subcategoría tiene su propia página con los artículos más pedidos y el buscador acotado.`,
        );
      }
      parts.push(
        `## Cómo usar el comparador`,
        `Escribí lo que buscás en el buscador de esta página o filtrá por tienda, marca y rango de precio. Cada ficha te lleva a la tienda con un clic; nosotros no vendemos nada, solo te decimos dónde está más barato.`,
      );
      return parts.join("\n\n");
    },
  },
  en: {
    breadcrumbs: "Breadcrumb",
    indexEyebrow: "Catalog by category",
    indexTitle: "All categories",
    indexNative: "Browse by what you need",
    indexTagline: (products, categories) =>
      `${products} products from Honduras' stores, organized in ${categories} categories. Pick one and compare prices.`,
    featuredHeading: "Popular categories",
    allHeading: "Shop by category",
    allSub: "The whole catalog, A to Z.",
    productsCount: (count) => `${count} products`,
    subcategoriesCount: (count) => (count === 1 ? "1 subcategory" : `${count} subcategories`),
    popularSubHeading: (name) => `${name}: most wanted`,
    popularProductsHeading: "Popular products",
    popularProductsSub: "What people who land on this category open the most.",
    browseSubHeading: "Shop by subcategory",
    alsoInHeading: (parent) => `Also in ${parent}`,
    searchHeading: (name) => `Search in ${name}`,
    searchSub: (name) =>
      `Filter ${name.toLowerCase()} by store, brand and price. The full catalog of this category, with up-to-date prices.`,
    aboutHeading: (name) => `${name} in Honduras`,
    defaultIntro: (name, products, stores) =>
      `Compare ${name.toLowerCase()} prices across ${stores} stores in Honduras. ${products} products with prices updated several times a day and their history, so you know whether a deal is real.`,
    defaultBody: (name, children) => {
      const lower = name.toLowerCase();
      const parts = [
        `## Where to buy ${lower} at the best price`,
        `Find Your Prices gathers in one place the ${lower} prices published by Honduras' stores: ${STORES_LINE} and more. Every product shows its current price, the discount when there is one, and its history, so you can tell whether today's "sale price" is the same as a month ago.`,
      ];
      if (children.length > 0) {
        parts.push(
          `## What this category includes`,
          `Here you'll find ${children.slice(0, 6).join(", ")}${children.length > 6 ? " and more" : ""}. Each subcategory has its own page with the most requested products and a scoped search.`,
        );
      }
      parts.push(
        `## How to use the comparator`,
        `Type what you're looking for in this page's search box, or filter by store, brand and price range. Every product links to the store in one click; we don't sell anything, we just tell you where it's cheapest.`,
      );
      return parts.join("\n\n");
    },
  },
};
