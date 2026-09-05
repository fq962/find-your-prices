// Pure filtering/faceting helpers for the products feature. No React, no
// DOM, no network/filesystem access — safe to import from a Server Component.

import type { Product } from "@/types";

export interface ProductFilterCriteria {
  query?: string;
  store?: string;
  category?: string;
}

export function filterProducts(
  products: Product[],
  criteria?: ProductFilterCriteria
): Product[] {
  const query = criteria?.query?.trim().toLowerCase();
  const store = criteria?.store;
  const category = criteria?.category;

  return products.filter((product) => {
    if (query && !product.name.toLowerCase().includes(query)) {
      return false;
    }
    if (store !== undefined && product.store !== store) {
      return false;
    }
    if (category !== undefined && product.category !== category) {
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
