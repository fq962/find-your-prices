import { describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  DEFAULT_SORT,
  isSortOption,
  SORT_OPTIONS,
  sortProducts,
  type SortOption,
} from "./sortProducts";

/**
 * Contrato de `sortProducts` (módulo puro, hermano de `filterProducts`):
 *
 *   export type SortOption = "relevance" | "price-asc" | "price-desc" | "name-asc";
 *   export function sortProducts(products: Product[], option?: SortOption): Product[];
 *
 *   - Devuelve siempre un array NUEVO; nunca muta el que recibe.
 *   - "relevance" (default) conserva el orden de entrada.
 *   - Los empates conservan el orden de entrada (sort estable).
 *   - El precio se compara como número: válido mientras todos los productos
 *     compartan moneda (ver el comentario del módulo).
 */

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Wireless Mouse",
    price: 24.99,
    currency: "USD",
    store: "Amazon",
    category: "Electronics",
    ...overrides,
  };
}

const CATALOG: Product[] = [
  makeProduct({ id: "c", name: "Coffee Maker", price: 45 }),
  makeProduct({ id: "a", name: "Air Fryer", price: 79 }),
  makeProduct({ id: "b", name: "Blender", price: 12.5 }),
];

const names = (products: Product[]) => products.map((product) => product.name);
const ids = (products: Product[]) => products.map((product) => product.id);

describe("sortProducts — pureza", () => {
  it("no muta el array que recibe", () => {
    const input = [...CATALOG];
    const snapshot = ids(input);

    sortProducts(input, "price-asc");

    expect(ids(input)).toEqual(snapshot);
  });

  it("devuelve un array distinto del de entrada, incluso sin reordenar", () => {
    const input = [...CATALOG];

    expect(sortProducts(input, "relevance")).not.toBe(input);
    expect(sortProducts([], "price-asc")).toEqual([]);
  });

  it("es determinista: dos llamadas con la misma entrada dan el mismo orden", () => {
    expect(ids(sortProducts(CATALOG, "price-desc"))).toEqual(
      ids(sortProducts(CATALOG, "price-desc")),
    );
  });
});

describe("sortProducts — criterios", () => {
  it("'relevance' conserva el orden de entrada", () => {
    expect(ids(sortProducts(CATALOG, "relevance"))).toEqual(["c", "a", "b"]);
  });

  it("sin opción explícita se comporta como el default ('relevance')", () => {
    expect(DEFAULT_SORT).toBe("relevance");
    expect(ids(sortProducts(CATALOG))).toEqual(ids(sortProducts(CATALOG, "relevance")));
  });

  it("'price-asc' ordena de menor a mayor precio", () => {
    expect(sortProducts(CATALOG, "price-asc").map((p) => p.price)).toEqual([12.5, 45, 79]);
  });

  it("'price-desc' ordena de mayor a menor precio", () => {
    expect(sortProducts(CATALOG, "price-desc").map((p) => p.price)).toEqual([79, 45, 12.5]);
  });

  it("'name-asc' ordena alfabéticamente por nombre", () => {
    expect(names(sortProducts(CATALOG, "name-asc"))).toEqual([
      "Air Fryer",
      "Blender",
      "Coffee Maker",
    ]);
  });

  it("'name-asc' usa comparación local: los acentos no se van al final", () => {
    const withAccents = [
      makeProduct({ id: "z", name: "Zapatos" }),
      makeProduct({ id: "a", name: "Área de trabajo" }),
      makeProduct({ id: "b", name: "Batidora" }),
    ];

    expect(ids(sortProducts(withAccents, "name-asc"))).toEqual(["a", "b", "z"]);
  });

  it("los empates de precio conservan el orden de entrada (sort estable)", () => {
    const tied = [
      makeProduct({ id: "primero", price: 30 }),
      makeProduct({ id: "segundo", price: 30 }),
      makeProduct({ id: "tercero", price: 10 }),
    ];

    expect(ids(sortProducts(tied, "price-asc"))).toEqual(["tercero", "primero", "segundo"]);
  });

  it("una opción desconocida cae en el comportamiento del default en vez de romper", () => {
    // Puede llegar desde un <select> manipulado o un valor viejo persistido.
    const unknown = "por-color" as SortOption;

    expect(ids(sortProducts(CATALOG, unknown))).toEqual(ids(CATALOG));
  });
});

describe("isSortOption — validación del valor que llega de la UI", () => {
  it("acepta exactamente las opciones publicadas", () => {
    for (const option of SORT_OPTIONS) {
      expect(isSortOption(option)).toBe(true);
    }
  });

  it("rechaza cualquier otro string", () => {
    expect(isSortOption("")).toBe(false);
    expect(isSortOption("price")).toBe(false);
    expect(isSortOption("PRICE-ASC")).toBe(false);
  });
});
