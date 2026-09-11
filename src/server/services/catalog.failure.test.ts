import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Qué pasa cuando la base falla.
 *
 * Es la regresión del bug de "la portada muestra artículos de muestra":
 * `getCatalogSnapshot` devolvía un catálogo vacío ante cualquier error, la
 * regeneración de fondo lo cacheaba y todo el mundo veía el fixture durante
 * cinco minutos. La regla ahora es: con base configurada, un fallo se
 * reintenta y, si persiste, se lanza. Nunca se disfraza de "vacío".
 */

// El paquete real lanza en jsdom; la frontera la hace cumplir `next build`.
vi.mock("server-only", () => import("@/test/server-only-stub"));

const state = vi.hoisted(() => ({ failures: 0, calls: 0 }));

vi.mock("@/server/db/supabase", () => {
  /** Un builder encadenable que resuelve como PostgREST, o revienta N veces. */
  function builder(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const method of [
      "select",
      "not",
      "gt",
      "eq",
      "in",
      "is",
      "or",
      "ilike",
      "gte",
      "lte",
      "order",
      "range",
      "limit",
      "from",
      "maybeSingle",
      "single",
    ]) {
      chain[method] = self;
    }
    // `then` hace que `await builder` resuelva. Es lo que hace supabase-js.
    chain.then = (
      resolve: (value: unknown) => void,
      reject: (error: unknown) => void,
    ) => {
      state.calls += 1;
      if (state.failures > 0) {
        state.failures -= 1;
        reject(new Error("fetch failed"));
        return;
      }
      resolve({ data: [], error: null, count: 0 });
    };
    return chain;
  }
  return { getSupabaseAdmin: () => builder() };
});

// Con la variable puesta, el servicio considera que HAY base y no debe caer
// al fixture. Sin ella, `hasDatabase()` es falso y el fixture es lo correcto.
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  state.failures = 0;
  state.calls = 0;
});

describe("getCatalogSnapshot ante fallos de base", () => {
  test("un fallo persistente se lanza, no se devuelve un catálogo vacío", async () => {
    const { getCatalogSnapshot } = await import("./catalog");
    state.failures = 100;
    await expect(getCatalogSnapshot({ limit: 10 })).rejects.toThrow(
      /fetch failed/,
    );
  });

  test("un fallo pasajero se reintenta y la lectura sale bien", async () => {
    const { searchCatalog } = await import("./catalog");
    state.failures = 1;
    const result = await searchCatalog({ limit: 10 });
    expect(result).toEqual({ products: [], total: 0 });
    expect(state.calls).toBeGreaterThanOrEqual(2);
  });

  test("sin base configurada devuelve vacío sin tocar la red (modo fixture)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { getCatalogSnapshot } = await import("./catalog");
    const snapshot = await getCatalogSnapshot({ limit: 10 });
    expect(snapshot.products).toEqual([]);
    expect(state.calls).toBe(0);
  });
});

describe("getProductDetail ante fallos de base", () => {
  test("un error de red no se convierte en 404", async () => {
    const { getProductDetail } = await import("./catalog");
    state.failures = 100;
    await expect(getProductDetail("algun-slug")).rejects.toThrow();
  });
});
