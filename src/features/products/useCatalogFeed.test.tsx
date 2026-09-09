import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types";
import { CATALOG_PAGE_SIZE } from "./catalogPaging";
import { useCatalogFeed, type CatalogFeed, type UseCatalogFeedOptions } from "./useCatalogFeed";

/**
 * Contrato de `useCatalogFeed`.
 *
 * Estas pruebas existen porque el navegador de verificación no puede
 * ejercitarlas: `IntersectionObserver` sólo entrega callbacks cuando el
 * navegador produce fotogramas, y un panel oculto no produce ninguno. Acá el
 * observador se sustituye por un doble que guarda su callback, así que "el
 * visitante llegó al final de la lista" se puede provocar a voluntad.
 *
 * Lo que se fija:
 *
 *   - Con la consulta por defecto el primer lote NO se vuelve a pedir: ya vino
 *     en el HTML del servidor.
 *   - El desplazamiento de cada página es cuántos artículos hay en pantalla,
 *     nunca un número de página multiplicado por un tamaño supuesto. Este fue
 *     el fallo que se saltaba artículos entre la primera y la segunda página.
 *   - Un id repetido no entra dos veces, porque el catálogo cambia entre
 *     páginas mientras el scraper inserta.
 *   - La carga automática se detiene tras un número fijo de tandas y un clic
 *     manual le devuelve el presupuesto. Es lo que mantiene el pie de página
 *     alcanzable.
 *
 * El hook se monta dentro de un componente de verdad y no con `renderHook`
 * porque necesita que su centinela exista en el DOM: sin nodo al que
 * observar, el efecto sale antes de crear el observador y nada se dispara.
 */

// --- Doble del observador -------------------------------------------------

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

let observerCallbacks: ObserverCallback[] = [];

class FakeIntersectionObserver {
  constructor(private readonly callback: ObserverCallback) {
    observerCallbacks.push(callback);
  }
  observe() {}
  disconnect() {
    observerCallbacks = observerCallbacks.filter((entry) => entry !== this.callback);
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

/** Simula que el centinela del final de la lista entró en pantalla. */
async function scrollToEnd() {
  await act(async () => {
    for (const callback of [...observerCallbacks]) callback([{ isIntersecting: true }]);
  });
}

// --- Montaje --------------------------------------------------------------

function makeProducts(from: number, count: number): Product[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${from + index}`,
    name: `Producto ${from + index}`,
    price: 100 + from + index,
    currency: "HNL",
    store: "Diunsa",
    category: "Hogar",
  }));
}

const TOTAL = 5000;
const DEFAULT_QUERY = "sort=newest&locale=es";

/** Sirve páginas coherentes leyendo el `offset` que pidió el hook. */
function serveByOffset(total = TOTAL) {
  return vi.fn(async (url: string) => {
    const offset = Number(new URL(url, "http://localhost").searchParams.get("offset") ?? 0);
    const remaining = Math.max(0, Math.min(CATALOG_PAGE_SIZE, total - offset));
    return {
      ok: true,
      json: async () => ({ products: makeProducts(offset, remaining), total }),
    } as Response;
  });
}

/** Todo lo que la prueba observa; el centinela lo consume el propio montaje. */
type FeedView = Omit<CatalogFeed, "sentinelRef">;

function Harness({
  options,
  onRender,
}: {
  options: UseCatalogFeedOptions;
  onRender: (feed: FeedView) => void;
}) {
  const { sentinelRef, ...feed } = useCatalogFeed(options);

  // Se publica desde un efecto y no durante el render: leer o pasar un ref
  // mientras se renderiza es justo lo que React desaconseja.
  useEffect(() => {
    onRender(feed);
  });

  return <div ref={sentinelRef} data-testid="sentinel" />;
}

function renderFeed(overrides: Partial<UseCatalogFeedOptions> = {}) {
  const latest = { current: null as FeedView | null };
  const options: UseCatalogFeedOptions = {
    enabled: true,
    queryString: DEFAULT_QUERY,
    isDefaultQuery: true,
    initialProducts: makeProducts(0, CATALOG_PAGE_SIZE),
    initialTotal: TOTAL,
    ...overrides,
  };

  render(
    <Harness
      options={options}
      onRender={(feed) => {
        latest.current = feed;
      }}
    />,
  );

  return { feed: () => latest.current! };
}

beforeEach(() => {
  observerCallbacks = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCatalogFeed — primer lote", () => {
  it("con la consulta por defecto muestra lo servido sin pedir nada", () => {
    const fetchMock = serveByOffset();
    vi.stubGlobal("fetch", fetchMock);

    const { feed } = renderFeed();

    expect(feed().products).toHaveLength(CATALOG_PAGE_SIZE);
    expect(feed().total).toBe(TOTAL);
    expect(feed().hasMore).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin API no pagina: el catálogo es el que ya está en memoria", () => {
    vi.stubGlobal("fetch", serveByOffset());

    const { feed } = renderFeed({ enabled: false });

    expect(feed().hasMore).toBe(false);
  });
});

describe("useCatalogFeed — páginas siguientes", () => {
  it("pide la página siguiente desde cuántos artículos hay, no desde un número de página", async () => {
    const fetchMock = serveByOffset();
    vi.stubGlobal("fetch", fetchMock);

    const { feed } = renderFeed();
    await scrollToEnd();

    await waitFor(() => expect(feed().products).toHaveLength(CATALOG_PAGE_SIZE * 2));

    const requested = new URL(fetchMock.mock.calls[0][0] as string, "http://localhost");
    expect(requested.searchParams.get("offset")).toBe(String(CATALOG_PAGE_SIZE));
    expect(requested.searchParams.get("limit")).toBe(String(CATALOG_PAGE_SIZE));
    // Sin huecos: el primer artículo de la segunda página sigue al último de la
    // primera. Es exactamente lo que el fallo anterior rompía.
    expect(feed().products[CATALOG_PAGE_SIZE].id).toBe(`p${CATALOG_PAGE_SIZE}`);
  });

  it("descarta ids repetidos cuando el catálogo se corrió entre páginas", async () => {
    // Solapamiento: el scraper insertó filas y el offset ya no cae donde caía.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ products: makeProducts(CATALOG_PAGE_SIZE - 10, 20), total: TOTAL }),
      })),
    );

    const { feed } = renderFeed();
    await scrollToEnd();

    await waitFor(() => expect(feed().products.length).toBeGreaterThan(CATALOG_PAGE_SIZE));

    const ids = feed().products.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 48 iniciales más los 10 que de verdad eran nuevos, de los 20 que llegaron.
    expect(ids).toHaveLength(CATALOG_PAGE_SIZE + 10);
  });

  it("un fallo de red no borra lo que ya se veía", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response));

    const { feed } = renderFeed();
    await scrollToEnd();

    await waitFor(() => expect(feed().hasError).toBe(true));
    expect(feed().products).toHaveLength(CATALOG_PAGE_SIZE);
  });
});

describe("useCatalogFeed — tope de la carga automática", () => {
  it("deja de cargar sola tras cuatro tandas y lo dice", async () => {
    vi.stubGlobal("fetch", serveByOffset());

    const { feed } = renderFeed();

    for (let round = 0; round < 6; round += 1) {
      await scrollToEnd();
      await waitFor(() => expect(feed().isLoadingMore).toBe(false));
    }

    // Cuatro tandas automáticas sobre el lote inicial y ni una más, por mucho
    // que se siga llegando al final.
    expect(feed().products).toHaveLength(CATALOG_PAGE_SIZE * 5);
    expect(feed().isAutoPaused).toBe(true);
    expect(feed().hasMore).toBe(true);
  });

  it("un clic manual devuelve el presupuesto y la carga automática sigue", async () => {
    vi.stubGlobal("fetch", serveByOffset());

    const { feed } = renderFeed();

    for (let round = 0; round < 5; round += 1) {
      await scrollToEnd();
      await waitFor(() => expect(feed().isLoadingMore).toBe(false));
    }
    expect(feed().isAutoPaused).toBe(true);

    await act(async () => feed().loadMore());
    await waitFor(() => expect(feed().isLoadingMore).toBe(false));

    expect(feed().isAutoPaused).toBe(false);
    expect(feed().products).toHaveLength(CATALOG_PAGE_SIZE * 6);
  });

  it("no pide más allá del total", async () => {
    const small = CATALOG_PAGE_SIZE + 5;
    vi.stubGlobal("fetch", serveByOffset(small));

    const { feed } = renderFeed({ initialTotal: small });
    expect(feed().hasMore).toBe(true);

    await scrollToEnd();
    await waitFor(() => expect(feed().products).toHaveLength(small));

    expect(feed().hasMore).toBe(false);
  });
});
