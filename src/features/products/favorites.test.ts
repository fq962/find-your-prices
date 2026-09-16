import { beforeEach, describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  MAX_FAVORITES,
  getFavoritesSnapshot,
  isFavorite,
  normalizeFavorites,
  readFavorites,
  removeFavorite,
  toggleFavorite,
  writeFavorites,
} from "./favorites";

/**
 * Contrato de favoritos (módulo puro + persistencia, hermano de `compareTray`):
 *
 *   - `toggleFavorite` agrega AL PRINCIPIO si no está y quita si está; NUNCA
 *     muta la entrada. No hay tope al agregar: es una lista de deseos.
 *   - `normalizeFavorites` acepta cualquier cosa y devuelve una lista usable:
 *     descarta lo que no parezca producto, colapsa ids repetidos y recorta al
 *     tope por el final (se descarta lo más antiguo, no lo nuevo).
 *   - Nada de esto lanza: un almacenamiento roto no puede impedir ver el
 *     catálogo.
 */

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Wireless Mouse",
    price: 24.99,
    currency: "HNL",
    store: "Diunsa",
    category: "Electrónica",
    ...overrides,
  };
}

const A = makeProduct({ id: "a", name: "Air Fryer" });
const B = makeProduct({ id: "b", name: "Blender" });
const C = makeProduct({ id: "c", name: "Coffee Maker" });

const ids = (list: Product[]) => list.map((product) => product.id);

beforeEach(() => {
  window.localStorage.clear();
  writeFavorites([]);
});

describe("toggleFavorite", () => {
  it("agrega al principio lo que no estaba", () => {
    expect(ids(toggleFavorite([A], B))).toEqual(["b", "a"]);
  });

  it("quita lo que ya estaba", () => {
    expect(ids(toggleFavorite([A, B], A))).toEqual(["b"]);
  });

  it("no muta la entrada", () => {
    const input = [A];
    toggleFavorite(input, B);
    toggleFavorite(input, A);
    expect(ids(input)).toEqual(["a"]);
  });

  it("no tiene tope al agregar", () => {
    let list: Product[] = [];
    for (let i = 0; i < 10; i += 1) list = toggleFavorite(list, makeProduct({ id: `p${i}` }));
    expect(list).toHaveLength(10);
  });
});

describe("isFavorite / removeFavorite", () => {
  it("responde por id", () => {
    expect(isFavorite([A, B], "b")).toBe(true);
    expect(isFavorite([A, B], "z")).toBe(false);
  });

  it("quitar algo que no está devuelve la misma lista en contenido", () => {
    expect(ids(removeFavorite([A, B], "z"))).toEqual(["a", "b"]);
    expect(ids(removeFavorite([A, B], "a"))).toEqual(["b"]);
  });
});

describe("normalizeFavorites", () => {
  it("devuelve vacío para lo que no sea un array", () => {
    expect(normalizeFavorites(null)).toEqual([]);
    expect(normalizeFavorites("x")).toEqual([]);
    expect(normalizeFavorites({ id: "a" })).toEqual([]);
  });

  it("descarta lo que no parezca producto y colapsa repetidos", () => {
    const result = normalizeFavorites([A, { id: "x" }, null, { ...A, name: "otro" }, B, 3]);
    expect(ids(result)).toEqual(["a", "b"]);
    // Ante un id repetido se queda con la primera aparición, que es la más reciente.
    expect(result[0].name).toBe("Air Fryer");
  });

  it("recorta al tope por el final", () => {
    const many = Array.from({ length: MAX_FAVORITES + 5 }, (_, i) => makeProduct({ id: `p${i}` }));
    const result = normalizeFavorites(many);
    expect(result).toHaveLength(MAX_FAVORITES);
    expect(result[0].id).toBe("p0");
    expect(result[MAX_FAVORITES - 1].id).toBe(`p${MAX_FAVORITES - 1}`);
  });
});

describe("persistencia", () => {
  it("lo escrito se lee de vuelta", () => {
    writeFavorites([B, A]);
    expect(ids(readFavorites())).toEqual(["b", "a"]);
    expect(ids(getFavoritesSnapshot())).toEqual(["b", "a"]);
  });

  it("el snapshot conserva la referencia mientras nada cambie", () => {
    writeFavorites([A]);
    expect(getFavoritesSnapshot()).toBe(getFavoritesSnapshot());
  });

  it("json corrupto en localStorage no rompe nada", () => {
    window.localStorage.setItem("fyp.favorites", "{no es json");
    expect(readFavorites()).toEqual([]);
  });

  it("al llegar al tope se descarta lo más antiguo, no lo nuevo", () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => makeProduct({ id: `p${i}` }));
    writeFavorites(toggleFavorite(full, C));
    const stored = readFavorites();
    expect(stored).toHaveLength(MAX_FAVORITES);
    expect(stored[0].id).toBe("c");
    expect(isFavorite(stored, `p${MAX_FAVORITES - 1}`)).toBe(false);
  });
});
