import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Si `mv_catalog` (0030) no existe todavía, el catálogo lee de la vista y no
 * se cae. Es la regla de siempre en este servicio: una migración pendiente
 * degrada el rendimiento, nunca el sitio.
 */

vi.mock("server-only", () => import("@/test/server-only-stub"));

const state = vi.hoisted(() => ({ tables: [] as string[], mvExists: false }));

vi.mock("@/server/db/supabase", () => {
  function builder(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const method of ["select", "not", "eq", "in", "is", "or", "gt", "textSearch", "like", "gte", "lte", "order", "range"]) {
      chain[method] = self;
    }
    chain.then = (resolve: (value: unknown) => void) => {
      if (table === "mv_catalog" && !state.mvExists) {
        resolve({
          data: null,
          count: null,
          error: {
            code: "PGRST205",
            message: "Could not find the table 'find_your_prices.mv_catalog' in the schema cache",
          },
        });
        return;
      }
      resolve({ data: [], error: null, count: 7 });
    };
    return chain;
  }
  return {
    getSupabaseAdmin: () => ({
      from: (table: string) => {
        state.tables.push(table);
        return builder(table);
      },
    }),
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => fn,
}));

import { searchCatalog } from "./catalog";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  state.tables = [];
});

describe("fuente del catálogo", () => {
  test("sin la materializada baja a la vista y responde; después ya no la vuelve a pedir", async () => {
    // Con texto y orden "newest" la búsqueda va en capas (ver runCatalogQuery):
    // una cuenta de los que empiezan por "tv", sus filas, y las del resto.
    // El doble responde 7 a cada cuenta, así que el total es 7 + 7. Lo que
    // se comprueba acá es la fuente: la primera petición va a la
    // materializada, falla, y TODAS las siguientes van a la vista.
    const first = await searchCatalog({ query: "tv", sort: "newest" });
    expect(first.total).toBe(14);
    expect(state.tables[0]).toBe("mv_catalog");
    expect(state.tables.slice(1).every((table) => table === "v_store_products_current")).toBe(true);
    expect(state.tables.length).toBeGreaterThan(1);

    state.tables = [];
    const second = await searchCatalog({ query: "tv", sort: "newest" });
    expect(second.total).toBe(14);
    expect(state.tables.every((table) => table === "v_store_products_current")).toBe(true);
    expect(state.tables.length).toBeGreaterThan(0);
  });
});
