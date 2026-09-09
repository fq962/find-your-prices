import { beforeEach, describe, expect, it } from "vitest";
import type { Product } from "@/types";
import {
  MAX_COMPARE_ITEMS,
  getCompareTraySnapshot,
  isInTray,
  isTrayFull,
  normalizeTray,
  readCompareTray,
  removeFromTray,
  toggleInTray,
  writeCompareTray,
} from "./compareTray";

/**
 * Contrato de la bandeja de comparación (módulo puro + persistencia, hermano
 * de `viewPreferences`):
 *
 *   - `toggleInTray` agrega si no está y quita si está; NUNCA muta la entrada.
 *   - Con la bandeja llena, agregar algo nuevo devuelve la MISMA referencia:
 *     nada entra a costa de expulsar en silencio lo que el usuario eligió.
 *   - `normalizeTray` acepta cualquier cosa y devuelve una bandeja usable:
 *     descarta lo que no parezca producto, colapsa ids repetidos y recorta al
 *     tope. Es la puerta de entrada tanto de lo leído de localStorage (que
 *     puede venir de una versión anterior) como de lo escrito.
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
const D = makeProduct({ id: "d", name: "Dishwasher" });
const E = makeProduct({ id: "e", name: "Espresso" });

const ids = (tray: Product[]) => tray.map((product) => product.id);

beforeEach(() => {
  window.localStorage.clear();
  // La caché del store vive en el módulo: escribir vacío la deja en un estado
  // conocido sin tener que reimportar el módulo en cada prueba.
  writeCompareTray([]);
});

describe("toggleInTray", () => {
  it("agrega al final lo que no estaba", () => {
    expect(ids(toggleInTray([A], B))).toEqual(["a", "b"]);
  });

  it("quita lo que ya estaba, sin importar la posición", () => {
    expect(ids(toggleInTray([A, B, C], B))).toEqual(["a", "c"]);
  });

  it("no muta el array que recibe", () => {
    const input = [A, B];
    toggleInTray(input, C);
    expect(ids(input)).toEqual(["a", "b"]);
  });

  it("con la bandeja llena devuelve la misma referencia en vez de expulsar algo", () => {
    const full = [A, B, C, D];
    expect(full).toHaveLength(MAX_COMPARE_ITEMS);
    expect(toggleInTray(full, E)).toBe(full);
  });

  it("con la bandeja llena todavía deja quitar", () => {
    expect(ids(toggleInTray([A, B, C, D], C))).toEqual(["a", "b", "d"]);
  });
});

describe("consultas", () => {
  it("isInTray compara por id, no por identidad de objeto", () => {
    expect(isInTray([A], "a")).toBe(true);
    expect(isInTray([A], "z")).toBe(false);
    expect(isInTray([{ ...A }], "a")).toBe(true);
  });

  it("isTrayFull es cierto exactamente al llegar al tope", () => {
    expect(isTrayFull([A, B, C])).toBe(false);
    expect(isTrayFull([A, B, C, D])).toBe(true);
  });

  it("removeFromTray deja intacta la bandeja si el id no está", () => {
    expect(ids(removeFromTray([A, B], "z"))).toEqual(["a", "b"]);
  });
});

describe("normalizeTray", () => {
  it("devuelve vacío ante cualquier cosa que no sea un array", () => {
    expect(normalizeTray(null)).toEqual([]);
    expect(normalizeTray(undefined)).toEqual([]);
    expect(normalizeTray("[]")).toEqual([]);
    expect(normalizeTray({ 0: A })).toEqual([]);
  });

  it("descarta las entradas que no tienen lo mínimo para pintar una columna", () => {
    const dirty = [A, null, { id: "x" }, { ...B, price: "12" }, { ...C, id: "" }, D];
    expect(ids(normalizeTray(dirty))).toEqual(["a", "d"]);
  });

  it("colapsa ids repetidos conservando la primera aparición", () => {
    expect(ids(normalizeTray([A, { ...A, name: "Otro" }, B]))).toEqual(["a", "b"]);
  });

  it("recorta al tope aunque le pasen de más", () => {
    expect(normalizeTray([A, B, C, D, E])).toHaveLength(MAX_COMPARE_ITEMS);
  });
});

describe("persistencia", () => {
  it("lo escrito se vuelve a leer igual", () => {
    writeCompareTray([A, B]);
    expect(ids(readCompareTray())).toEqual(["a", "b"]);
  });

  it("escribe ya normalizado: el tope no depende de quien llama", () => {
    writeCompareTray([A, B, C, D, E]);
    expect(readCompareTray()).toHaveLength(MAX_COMPARE_ITEMS);
  });

  it("un JSON corrupto se lee como bandeja vacía en vez de lanzar", () => {
    window.localStorage.setItem("fyp.catalog.compare", "{no es json");
    expect(readCompareTray()).toEqual([]);
  });

  it("sin nada guardado devuelve una bandeja vacía", () => {
    window.localStorage.clear();
    expect(readCompareTray()).toEqual([]);
  });

  it("getCompareTraySnapshot devuelve la MISMA referencia mientras nada cambie", () => {
    writeCompareTray([A]);
    expect(getCompareTraySnapshot()).toBe(getCompareTraySnapshot());
  });

  it("getCompareTraySnapshot devuelve una referencia nueva tras escribir", () => {
    writeCompareTray([A]);
    const before = getCompareTraySnapshot();
    writeCompareTray([A, B]);
    expect(getCompareTraySnapshot()).not.toBe(before);
  });
});
