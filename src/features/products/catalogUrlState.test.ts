import { describe, expect, it } from "vitest";
import { EMPTY_FILTER_STATE } from "./catalogFilters";
import {
  catalogUrlSearch,
  EMPTY_CATALOG_URL_STATE,
  parseCatalogUrl,
  type CatalogUrlState,
} from "./catalogUrlState";

/**
 * El contrato de este módulo es que una URL compartida abra exactamente el
 * mismo catálogo que veía quien la copió. Todo lo de acá abajo comprueba esa
 * ida y vuelta, más las dos formas de romperla: escribir de más (parámetros
 * que sólo dicen "nada seleccionado") y leer de menos.
 */

describe("catalogUrlSearch — sólo escribe lo que se apartó del default", () => {
  it("no escribe nada para el catálogo sin tocar", () => {
    expect(catalogUrlSearch(EMPTY_CATALOG_URL_STATE)).toBe("");
  });

  it("omite el orden por defecto, que es el que la página ya sirve", () => {
    const search = catalogUrlSearch({ ...EMPTY_CATALOG_URL_STATE, query: "iphone" });
    expect(search).toBe("?q=iphone");
    expect(search).not.toContain("sort=");
  });

  it("escribe el orden cuando se eligió otro", () => {
    expect(catalogUrlSearch({ ...EMPTY_CATALOG_URL_STATE, sort: "price-asc" })).toBe(
      "?sort=price-asc",
    );
  });

  it("descarta una búsqueda en blanco", () => {
    expect(catalogUrlSearch({ ...EMPTY_CATALOG_URL_STATE, query: "   " })).toBe("");
  });

  it("un precio mínimo de 0 se escribe: es un filtro puesto, no un hueco", () => {
    const search = catalogUrlSearch({
      ...EMPTY_CATALOG_URL_STATE,
      filters: { ...EMPTY_FILTER_STATE, minPrice: 0, maxPrice: 500 },
    });
    expect(search).toContain("minPrice=0");
    expect(search).toContain("maxPrice=500");
  });
});

describe("parseCatalogUrl — nada de lo que llegue puede romper el catálogo", () => {
  it("una query string vacía da el estado por defecto", () => {
    expect(parseCatalogUrl("")).toEqual(EMPTY_CATALOG_URL_STATE);
  });

  it("un orden que no existe cae al default en vez de viajar a Postgres", () => {
    expect(parseCatalogUrl("?sort=por-color").sort).toBe(EMPTY_CATALOG_URL_STATE.sort);
  });

  it("un precio que no es número se descarta en vez de convertirse en NaN", () => {
    const { filters } = parseCatalogUrl("?minPrice=abc&maxPrice=-3");
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });

  it("un parámetro presente pero vacío es lo mismo que no traerlo", () => {
    expect(parseCatalogUrl("?store=&category=").store).toEqual([]);
  });

  it("un parámetro repetido se lee como varias opciones, sin duplicados", () => {
    expect(parseCatalogUrl("?store=Diunsa&store=Walmart&store=Diunsa").store).toEqual([
      "Diunsa",
      "Walmart",
    ]);
  });

  it("los interruptores sólo se encienden con '1'", () => {
    expect(parseCatalogUrl("?onlyDiscounted=1").filters.onlyDiscounted).toBe(true);
    expect(parseCatalogUrl("?onlyDiscounted=true").filters.onlyDiscounted).toBe(false);
  });
});

describe("ida y vuelta", () => {
  it("un catálogo con todo puesto sobrevive el viaje entero", () => {
    const state: CatalogUrlState = {
      query: "audífonos inalámbricos",
      store: ["Walmart Honduras", "Diunsa"],
      category: ["Audio y Video"],
      sort: "price-asc",
      filters: {
        minPrice: 500,
        maxPrice: 2_000,
        brand: ["Sony", "Samsung"],
        onlyDiscounted: true,
        includeUnavailable: true,
      },
    };

    expect(parseCatalogUrl(catalogUrlSearch(state))).toEqual(state);
  });

  it("el espacio final de lo tecleado no se pierde: el campo se lee de vuelta desde la URL, y recortarlo acá lo borraría mientras se escribe", () => {
    expect(parseCatalogUrl(catalogUrlSearch({ ...EMPTY_CATALOG_URL_STATE, query: "iphone " })).query)
      .toBe("iphone ");
  });
});
