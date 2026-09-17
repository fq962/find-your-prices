import type { Locale } from "@/features/i18n/translate";

/**
 * Textos fijos de las páginas de tienda, por idioma.
 *
 * Como `categoryCopy.ts`: son Server Components, no hay `useLocale`, y la
 * ruta pasa el idioma. Todo lo que nombra a la tienda o a la categoría se
 * arma con funciones para que el nombre entre en la frase —"Abarrotes en
 * PriceSmart"— y no quede como una etiqueta al lado.
 */
export interface StoreCopy {
  breadcrumbs: string;
  indexEyebrow: string;
  indexTitle: string;
  indexNative: string;
  indexTagline: (products: string, stores: number) => string;
  indexHeading: string;
  indexSub: string;
  productsCount: (count: string) => string;
  categoriesCount: (count: number) => string;
  storeEyebrow: string;
  /** "Categorías populares en PriceSmart" / "Abarrotes en PriceSmart: lo más buscado". */
  popularCategoriesHeading: (store: string, category: string | null) => string;
  popularProductsHeading: (store: string, category: string | null) => string;
  popularProductsSub: string;
  browseHeading: (store: string, category: string | null) => string;
  alsoInHeading: (parent: string, store: string) => string;
  searchHeading: (store: string, category: string | null) => string;
  searchSub: (store: string, category: string | null) => string;
  intro: (store: string, category: string | null, products: string, categories: number) => string;
  visitStore: (store: string) => string;
  /** "en {tienda}" / "at {store}", el sufijo que concatena categoría y tienda. */
  inStore: (category: string, store: string) => string;
}

export const STORE_COPY: Record<Locale, StoreCopy> = {
  es: {
    breadcrumbs: "Ubicación",
    indexEyebrow: "Catálogo por tienda",
    indexTitle: "Todas las tiendas",
    indexNative: "Entrá a la que te queda cerca",
    indexTagline: (products, stores) =>
      `${products} artículos de ${stores} tiendas de Honduras. Elegí una tienda y buscá por categoría; cada precio se compara con las demás.`,
    indexHeading: "Comprar por tienda",
    indexSub: "Las tiendas con más surtido primero.",
    productsCount: (count) => `${count} artículos`,
    categoriesCount: (count) => (count === 1 ? "1 categoría" : `${count} categorías`),
    storeEyebrow: "Tienda",
    popularCategoriesHeading: (store, category) =>
      category ? `${category} en ${store}: lo más buscado` : `Categorías populares en ${store}`,
    popularProductsHeading: (store, category) =>
      category ? `Productos populares de ${category} en ${store}` : `Productos populares en ${store}`,
    popularProductsSub: "Lo que más abren las personas que llegan a esta página.",
    browseHeading: (store, category) =>
      category ? `Comprar por subcategoría en ${store}` : `Comprar por categoría en ${store}`,
    alsoInHeading: (parent, store) => `También en ${parent} de ${store}`,
    searchHeading: (store, category) =>
      category ? `Buscá ${category.toLowerCase()} en ${store}` : `Buscá en ${store}`,
    searchSub: (store, category) =>
      category
        ? `Todo ${category.toLowerCase()} que vende ${store}, con precio actualizado. Filtrá por marca y precio.`
        : `Todo el catálogo de ${store}, con precio actualizado. Filtrá por categoría, marca y precio.`,
    intro: (store, category, products, categories) =>
      category
        ? `Precios de ${category.toLowerCase()} en ${store}, Honduras: ${products} artículos con precio actualizado varias veces al día y su historial, para saber si la oferta de ${store} es real o si otra tienda lo tiene más barato.`
        : `Todo lo que ${store} publica en Honduras, en un solo lugar: ${products} artículos en ${categories} categorías, con precio actualizado varias veces al día y su historial. Cada artículo se compara con las demás tiendas.`,
    visitStore: (store) => `Ir al sitio de ${store}`,
    inStore: (category, store) => `${category} en ${store}`,
  },
  en: {
    breadcrumbs: "Breadcrumb",
    indexEyebrow: "Catalog by store",
    indexTitle: "All stores",
    indexNative: "Pick the one near you",
    indexTagline: (products, stores) =>
      `${products} products from ${stores} stores in Honduras. Pick a store and browse by category; every price is compared with the rest.`,
    indexHeading: "Shop by store",
    indexSub: "Stores with the widest range first.",
    productsCount: (count) => `${count} products`,
    categoriesCount: (count) => (count === 1 ? "1 category" : `${count} categories`),
    storeEyebrow: "Store",
    popularCategoriesHeading: (store, category) =>
      category ? `${category} at ${store}: most wanted` : `Popular categories at ${store}`,
    popularProductsHeading: (store, category) =>
      category ? `Popular ${category.toLowerCase()} at ${store}` : `Popular products at ${store}`,
    popularProductsSub: "What people who land on this page open the most.",
    browseHeading: (store, category) =>
      category ? `Shop by subcategory at ${store}` : `Shop by category at ${store}`,
    alsoInHeading: (parent, store) => `Also in ${parent} at ${store}`,
    searchHeading: (store, category) =>
      category ? `Search ${category.toLowerCase()} at ${store}` : `Search at ${store}`,
    searchSub: (store, category) =>
      category
        ? `Every ${category.toLowerCase()} item ${store} sells, with up-to-date prices. Filter by brand and price.`
        : `${store}'s whole catalog, with up-to-date prices. Filter by category, brand and price.`,
    intro: (store, category, products, categories) =>
      category
        ? `${category} prices at ${store}, Honduras: ${products} products with prices updated several times a day and their history, so you know whether ${store}'s deal is real or another store has it cheaper.`
        : `Everything ${store} publishes in Honduras, in one place: ${products} products across ${categories} categories, with prices updated several times a day and their history. Every product is compared with the other stores.`,
    visitStore: (store) => `Go to ${store}'s site`,
    inStore: (category, store) => `${category} at ${store}`,
  },
};
