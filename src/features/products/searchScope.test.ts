import { describe, expect, test } from "vitest";
import { EMPTY_CATALOG_URL_STATE } from "./catalogUrlState";
import {
  inPlaceState,
  isInPlace,
  pageSelection,
  parseSearchPage,
  parseSelectionKey,
  searchHref,
  selectionKey,
} from "./searchScope";

const url = (category: string[] = [], query = "") => ({ ...EMPTY_CATALOG_URL_STATE, query, category });

describe("parseSearchPage", () => {
  test("reconoce portada, tienda, tienda × categoría y categoría en los dos idiomas", () => {
    expect(parseSearchPage("/", "es")).toEqual({ kind: "home" });
    expect(parseSearchPage("/en", "en")).toEqual({ kind: "home" });
    expect(parseSearchPage("/tiendas/pricesmart", "es")).toEqual({
      kind: "store",
      store: "pricesmart",
      category: null,
    });
    expect(parseSearchPage("/en/stores/pricesmart/abarrotes", "en")).toEqual({
      kind: "store",
      store: "pricesmart",
      category: "abarrotes",
    });
    expect(parseSearchPage("/categorias/electronica", "es")).toEqual({
      kind: "category",
      category: "electronica",
    });
  });

  test("el resto de páginas no tiene catálogo", () => {
    expect(parseSearchPage("/tiendas", "es")).toEqual({ kind: "other" });
    expect(parseSearchPage("/p/iphone-15", "es")).toEqual({ kind: "other" });
    expect(parseSearchPage("/tiendas/pricesmart", "en")).toEqual({ kind: "other" });
  });
});

describe("pageSelection e isInPlace", () => {
  test("en una tienda arranca en la tienda, y su categoría sale de la ruta o de la URL", () => {
    const store = parseSearchPage("/tiendas/pricesmart", "es");
    expect(pageSelection(store, url())).toEqual({ store: "pricesmart", category: null });
    expect(pageSelection(store, url(["abarrotes"]))).toEqual({ store: "pricesmart", category: "abarrotes" });

    const scoped = parseSearchPage("/tiendas/pricesmart/abarrotes", "es");
    expect(pageSelection(scoped, url(["granos"]))).toEqual({ store: "pricesmart", category: "abarrotes" });
  });

  test("solo se busca en la página si el alcance elegido es el suyo", () => {
    const store = parseSearchPage("/tiendas/pricesmart", "es");
    expect(isInPlace(store, { store: "pricesmart", category: "abarrotes" })).toBe(true);
    expect(isInPlace(store, { store: null, category: null })).toBe(false);

    const scoped = parseSearchPage("/tiendas/pricesmart/abarrotes", "es");
    expect(isInPlace(scoped, { store: "pricesmart", category: "abarrotes" })).toBe(true);
    expect(isInPlace(scoped, { store: "pricesmart", category: null })).toBe(false);

    expect(isInPlace({ kind: "home" }, { store: null, category: "electronica" })).toBe(true);
    expect(isInPlace({ kind: "other" }, { store: null, category: null })).toBe(false);
  });
});

describe("inPlaceState", () => {
  test("en la portada la categoría elegida es la faceta", () => {
    const next = inPlaceState({ kind: "home" }, { store: null, category: "bebidas" }, url(["x"]), "cola");
    expect(next.category).toEqual(["bebidas"]);
    expect(next.query).toBe("cola");
  });

  test("en una landing acotada deja la faceta de subcategorías como estaba", () => {
    const page = parseSearchPage("/categorias/abarrotes", "es");
    const next = inPlaceState(page, { store: null, category: "abarrotes" }, url(["granos"]), "arroz");
    expect(next.category).toEqual(["granos"]);
  });
});

describe("searchHref", () => {
  test("cada combinación va a la página que la representa, con el ancla de resultados", () => {
    expect(searchHref({ store: "pricesmart", category: "abarrotes" }, "arroz", "es")).toBe(
      "/tiendas/pricesmart/abarrotes?q=arroz#resultados",
    );
    expect(searchHref({ store: "pricesmart", category: null }, "arroz", "en")).toBe(
      "/en/stores/pricesmart?q=arroz#resultados",
    );
    expect(searchHref({ store: null, category: "abarrotes" }, "", "es")).toBe("/categorias/abarrotes#resultados");
    expect(searchHref({ store: null, category: null }, "arroz", "es")).toBe("/?q=arroz#resultados");
  });
});

test("la clave del <option> ida y vuelta", () => {
  for (const selection of [
    { store: null, category: null },
    { store: "pricesmart", category: null },
    { store: null, category: "abarrotes" },
    { store: "pricesmart", category: "abarrotes" },
  ]) {
    expect(parseSelectionKey(selectionKey(selection))).toEqual(selection);
  }
});
