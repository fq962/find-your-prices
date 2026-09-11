// Pure filtering/faceting helpers for the products feature. No React, no
// DOM, no network/filesystem access — safe to import from a Server Component.

import type { Product } from "@/types";

export interface ProductFilterCriteria {
  query?: string;
  /** One value or several; several combine with OR. Empty means "all". */
  store?: string | string[];
  category?: string | string[];
}

/** Normalizes a criterion to a list; `undefined` and `[]` both mean "no filter". */
function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function filterProducts(
  products: Product[],
  criteria?: ProductFilterCriteria
): Product[] {
  const query = criteria?.query?.trim().toLowerCase();
  const stores = toList(criteria?.store);
  const categories = toList(criteria?.category);

  return products.filter((product) => {
    if (query && !product.name.toLowerCase().includes(query)) {
      return false;
    }
    if (stores.length > 0 && !stores.includes(product.store)) {
      return false;
    }
    if (categories.length > 0 && !categories.includes(product.category)) {
      return false;
    }
    return true;
  });
}

export interface ProductFacets {
  stores: string[];
  categories: string[];
}

export function getFacets(products: Product[]): ProductFacets {
  const stores = Array.from(new Set(products.map((product) => product.store))).sort();
  const categories = Array.from(
    new Set(products.map((product) => product.category))
  ).sort();

  return { stores, categories };
}
