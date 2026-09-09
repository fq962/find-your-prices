// Ordenamiento puro de productos. Sin React, sin DOM, sin red — importable
// desde un Server Component, igual que `filterProducts`.

import type { Product } from "@/types";

export type SortOption =
  | "newest"
  | "relevance"
  | "discount"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "rating";

export const SORT_OPTIONS: readonly SortOption[] = [
  "newest",
  "relevance",
  "discount",
  "price-asc",
  "price-desc",
  "name-asc",
  "rating",
];

/**
 * Lo recién agregado abre la lista.
 *
 * "Destacados" era el orden de entrada del origen de datos: un criterio que no
 * significa nada para quien llega y que hace que la home se vea igual semana
 * tras semana. Lo que cambia entre visitas —y por tanto lo que justifica
 * volver— es el catálogo nuevo, así que ese es el primer plano por defecto.
 */
export const DEFAULT_SORT: SortOption = "newest";

export function isSortOption(value: string): value is SortOption {
  return (SORT_OPTIONS as readonly string[]).includes(value);
}

/**
 * Devuelve SIEMPRE un array nuevo, sin mutar la entrada: quien llama suele
 * pasar el fixture compartido o el resultado memoizado de `filterProducts`.
 *
 * "relevance" conserva el orden con el que llegó la lista (el del origen de
 * datos), y los empates en el resto de criterios también lo conservan:
 * `Array.prototype.sort` es estable desde ES2019.
 *
 * OJO con el precio: compara `product.price` como número, lo que sólo es
 * correcto mientras todos los productos compartan moneda (hoy
 * `DEFAULT_CURRENCY` para todo el fixture). Si algún día conviven monedas
 * distintas, esto necesita convertir antes de comparar.
 */
export function sortProducts(products: Product[], option: SortOption = DEFAULT_SORT): Product[] {
  const sorted = [...products];

  switch (option) {
    // Los productos sin descuento y sin calificación van al final en vez de
    // colarse arriba como si valieran 0: un artículo sin votos no es un
    // artículo mal valorado.
    case "discount":
      return sorted.sort((a, b) => (b.discountPercent ?? -1) - (a.discountPercent ?? -1));
    case "rating":
      return sorted.sort((a, b) => (b.ratingAverage ?? -1) - (a.ratingAverage ?? -1));
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "name-asc":
      // `localeCompare` para que acentos y mayúsculas ordenen como espera un
      // lector humano, no por code point.
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    // Ni "newest" ni "relevance" reordenan acá: el `Product` del cliente no
    // lleva fecha, así que la antigüedad solo la sabe la consulta que trajo la
    // lista. Reordenar en el navegador rompería ese orden en vez de afinarlo.
    case "newest":
    case "relevance":
    default:
      return sorted;
  }
}
