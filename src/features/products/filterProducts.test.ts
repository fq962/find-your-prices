// TAREAS 2-8 — Función pura `filterProducts` + derivación de facetas.
//
// Archivo objetivo que el implementer debe crear:
//   src/features/products/filterProducts.ts
//
// CONTRATO (definido aquí, el implementer debe respetarlo al pie de la
// letra):
//
//   export interface ProductFilterCriteria {
//     query?: string;     // texto libre; matchea SOLO contra `name`,
//                          // case-insensitive, substring (no exact match).
//                          // Se recorta (trim) antes de comparar. Si tras el
//                          // trim queda vacío ("" o solo espacios), se trata
//                          // como "sin filtro de query".
//     store?: string;     // coincidencia EXACTA contra `product.store`.
//     category?: string;  // coincidencia EXACTA contra `product.category`.
//   }
//
//   export function filterProducts(
//     products: Product[],
//     criteria?: ProductFilterCriteria
//   ): Product[]
//
//   - Sin `criteria` (undefined) o con `criteria = {}`: devuelve TODOS los
//     productos, en el mismo orden, sin mutar el array de entrada.
//   - Nunca devuelve `undefined`; si no hay coincidencias devuelve `[]`.
//   - Cuando se combinan `query` + `store` + `category`, la lógica es AND:
//     un producto solo pasa si cumple los tres criterios presentes.
//
//   export interface ProductFacets {
//     stores: string[];
//     categories: string[];
//   }
//
//   export function getFacets(products: Product[]): ProductFacets
//
//   - `stores` y `categories` contienen valores únicos (sin duplicados) y
//     ordenados alfabéticamente (orden ascendente, string sort estándar).
//   - Con `products = []`, devuelve `{ stores: [], categories: [] }`.
//
// Los productos usados en estos tests se construyen a mano dentro del
// archivo (no dependen del fixture real de la TAREA 1), para que este
// archivo no se rompa si el fixture cambia.

import { describe, expect, it } from "vitest";
import { filterProducts, getFacets } from "@/features/products/filterProducts";

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Default Product",
    price: 10,
    currency: "USD",
    store: "Store A",
    category: "Category A",
    ...overrides,
  };
}

describe("filterProducts", () => {
  it("TAREA 2: with no criteria, returns the full list in the same order and does not mutate the input array", () => {
    const products = [
      makeProduct({ id: "1", name: "Alpha" }),
      makeProduct({ id: "2", name: "Beta" }),
      makeProduct({ id: "3", name: "Gamma" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(products));

    const resultNoCriteria = filterProducts(products);
    const resultEmptyCriteria = filterProducts(products, {});

    expect(resultNoCriteria).toEqual(products);
    expect(resultEmptyCriteria).toEqual(products);
    expect(resultNoCriteria.map((p: { id: string }) => p.id)).toEqual(["1", "2", "3"]);

    // Non-mutation: the original array must remain exactly as it was.
    expect(products).toEqual(snapshot);
  });

  it("TAREA 3: query matches partially and case-insensitively against `name` only", () => {
    const products = [
      makeProduct({
        id: "1",
        name: "Wireless Mouse",
        description: "great for gaming setups",
      }),
      makeProduct({ id: "2", name: "Mechanical Keyboard" }),
    ];

    const matchByName = filterProducts(products, { query: "mouse" });
    expect(matchByName.map((p: { id: string }) => p.id)).toEqual(["1"]);

    const matchByNameUpperCase = filterProducts(products, { query: "MOUSE" });
    expect(matchByNameUpperCase.map((p: { id: string }) => p.id)).toEqual(["1"]);

    // "gaming" only appears in `description`, never in `name`, so it must
    // NOT match anything: query only searches `name`.
    const noMatchFromDescription = filterProducts(products, { query: "gaming" });
    expect(noMatchFromDescription).toEqual([]);
  });

  it("TAREA 4: query with no matches returns an empty array, never undefined or an error", () => {
    const products = [makeProduct({ id: "1", name: "Wireless Mouse" })];

    const result = filterProducts(products, { query: "nonexistent-term-xyz" });

    expect(result).toEqual([]);
    expect(result).not.toBeUndefined();
  });

  it("TAREA 5: filters by `store` with an exact match", () => {
    const products = [
      makeProduct({ id: "1", store: "Amazon" }),
      makeProduct({ id: "2", store: "Amazon Marketplace" }),
      makeProduct({ id: "3", store: "eBay" }),
    ];

    const result = filterProducts(products, { store: "Amazon" });

    expect(result.map((p: { id: string }) => p.id)).toEqual(["1"]);
  });

  it("TAREA 6: filters by `category` with an exact match", () => {
    const products = [
      makeProduct({ id: "1", category: "Electronics" }),
      makeProduct({ id: "2", category: "Electronics & Accessories" }),
      makeProduct({ id: "3", category: "Home" }),
    ];

    const result = filterProducts(products, { category: "Electronics" });

    expect(result.map((p: { id: string }) => p.id)).toEqual(["1"]);
  });

  it("several `store` values combine with OR; an empty list means no filter", () => {
    const products = [
      makeProduct({ id: "1", store: "Amazon" }),
      makeProduct({ id: "2", store: "Target" }),
      makeProduct({ id: "3", store: "eBay" }),
    ];

    expect(
      filterProducts(products, { store: ["Amazon", "eBay"] }).map((p: { id: string }) => p.id),
    ).toEqual(["1", "3"]);
    expect(filterProducts(products, { store: [], category: [] })).toHaveLength(3);
  });

  it("TAREA 7: combining query + store + category applies AND logic", () => {
    const products = [
      makeProduct({
        id: "1",
        name: "Wireless Mouse",
        store: "Amazon",
        category: "Electronics",
      }),
      makeProduct({
        // matches query and store, but not category
        id: "2",
        name: "Wireless Mouse",
        store: "Amazon",
        category: "Home",
      }),
      makeProduct({
        // matches query and category, but not store
        id: "3",
        name: "Wireless Mouse",
        store: "eBay",
        category: "Electronics",
      }),
      makeProduct({
        // matches store and category, but not query
        id: "4",
        name: "Mechanical Keyboard",
        store: "Amazon",
        category: "Electronics",
      }),
    ];

    const result = filterProducts(products, {
      query: "mouse",
      store: "Amazon",
      category: "Electronics",
    });

    expect(result.map((p: { id: string }) => p.id)).toEqual(["1"]);
  });

  it("edge case: a query with only whitespace is treated as no filter at all", () => {
    const products = [
      makeProduct({ id: "1", name: "Alpha" }),
      makeProduct({ id: "2", name: "Beta" }),
    ];

    const result = filterProducts(products, { query: "   " });

    expect(result).toEqual(products);
  });

  it("edge case: leading/trailing whitespace in query is trimmed before comparing", () => {
    const products = [makeProduct({ id: "1", name: "Wireless Mouse" })];

    const result = filterProducts(products, { query: "  mouse  " });

    expect(result.map((p: { id: string }) => p.id)).toEqual(["1"]);
  });
});

describe("getFacets", () => {
  it("TAREA 8: derives unique, alphabetically sorted store and category facets", () => {
    const products = [
      makeProduct({ id: "1", store: "eBay", category: "Home" }),
      makeProduct({ id: "2", store: "Amazon", category: "Electronics" }),
      makeProduct({ id: "3", store: "Amazon", category: "Home" }),
      makeProduct({ id: "4", store: "Costco", category: "Electronics" }),
    ];

    const facets = getFacets(products);

    expect(facets.stores).toEqual(["Amazon", "Costco", "eBay"]);
    expect(facets.categories).toEqual(["Electronics", "Home"]);
  });

  it("edge case: an empty product list produces empty facet arrays", () => {
    const facets = getFacets([]);

    expect(facets).toEqual({ stores: [], categories: [] });
  });
});
