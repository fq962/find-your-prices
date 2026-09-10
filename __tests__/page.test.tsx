/**
 * __tests__/page.test.tsx
 * ---------------------------------------------------------------------------
 * Tests de las rutas de la home (tareas 35, 37, 38 y 39 de la lista del
 * Planner).
 *
 * CAMBIO DE CONTRATO — el idioma vive en la URL
 * ---------------------------------------------------------------------------
 * La versión anterior de este archivo asumía una única página en
 * `src/app/page.tsx` que arrancaba en inglés y cambiaba de idioma en memoria
 * al pulsar el LocaleSwitcher. El producto pasó a servir cada idioma en su
 * propia ruta:
 *
 *   /     → español (idioma por defecto del sitio, sin prefijo)
 *   /en   → inglés
 *
 * Cada ruta tiene su propio root layout (route groups) para que `<html lang>`
 * sea correcto ya en el HTML del servidor, y el LocaleSwitcher pasó de ser un
 * toggle de estado a ser navegación real (ver LocaleSwitcher.test.tsx).
 *
 * Lo que ambas rutas siguen debiendo cumplir, verbatim del contrato original:
 *
 *   1. Envolver el árbol interactivo en `<LocaleProvider>`, de modo que
 *      ningún consumidor de `useLocale()` (Hero, LocaleSwitcher, SearchBar,
 *      StoreFilter, CategoryFilter, ProductSearchApp) lance
 *      "useLocale must be used within a LocaleProvider".
 *   2. Renderizar un `<LocaleSwitcher />` alcanzable por rol y nombre.
 *   3. Renderizar exactamente un `<h1>` (el título del sitio, vía `<Hero />`).
 *   4. Alimentar el fixture real de productos a `<ProductSearchApp />`, que a
 *      su vez expone un `searchbox`, dos `combobox` y una lista de
 *      resultados, en ese orden de DOM (apilado mobile-first).
 *
 * SEGUNDO CAMBIO DE CONTRATO — la home carga de la base
 * ---------------------------------------------------------------------------
 * Los productos ya no salen de `data.ts` sino del catálogo scrapeado, así que
 * las páginas pasaron a ser Server Components asíncronos. Dos consecuencias
 * para este archivo, ambas mecánicas — ninguna afirmación cambió:
 *
 *   a) Se renderiza con `render(await Page())`, no con `render(<Page />)`:
 *      un componente async no se puede renderizar como elemento.
 *   b) Se sustituye `@/server/services/catalog` por un doble que devuelve un
 *      catálogo vacío. Con la base fuera de juego, `HomeView` cae al fixture,
 *      que es justo lo que estas pruebas verifican. Sin el doble, la suite
 *      dependería de que haya una base con datos, y dejaría de ser
 *      determinista.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SpanishPage from "@/app/(es)/page";
import EnglishPage from "@/app/en/page";
import { products } from "@/features/products/data";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";

// Catálogo vacío -> HomeView usa el fixture. Ver la nota de contrato de arriba.
vi.mock("@/server/services/catalog", () => ({
  getCatalogSnapshot: async () => ({
    products: [],
    total: 0,
    facets: {
      categories: [],
      stores: [],
      brands: [],
      minPrice: 0,
      maxPrice: 0,
      totalProducts: 0,
      totalStores: 0,
      totalCategories: 0,
      discountedProducts: 0,
    },
  }),
}));

/** Renderiza un Server Component asíncrono resolviéndolo antes. */
async function renderPage(Page: () => Promise<React.ReactElement>) {
  return render(await Page());
}

const ROUTES = [
  { name: "/ (español, default)", Page: SpanishPage, dict: es },
  { name: "/en (inglés)", Page: EnglishPage, dict: en },
] as const;

describe.each(ROUTES)("Home $name", ({ Page, dict }) => {
  // Tarea 35 ---------------------------------------------------------------
  test("renderiza sin lanzar el error de LocaleProvider ausente", async () => {
    // El fallo que esta prueba vigila es que algún consumidor de useLocale()
    // quede fuera del provider, lo que lanza
    // "useLocale must be used within a LocaleProvider" durante el render.
    await expect(renderPage(Page)).resolves.toBeDefined();
  });

  // Tarea 37 ---------------------------------------------------------------
  test("renderiza nombres reales del fixture de productos", async () => {
    await renderPage(Page);

    // Se toman entradas reales del fixture en vez de literales, para que el
    // test siga siendo correcto si el contenido del fixture cambia.
    const sample = [products[0], products[2], products[4]];
    expect(sample.every((p) => typeof p?.name === "string" && p.name.length > 0)).toBe(true);

    for (const product of sample) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
  });

  // Tarea 38 ---------------------------------------------------------------
  test("ordena searchbox, luego filtros, luego lista (apilado mobile-first)", async () => {
    // NOTA: el número de columnas por breakpoint y el centrado visual no son
    // verificables en jsdom (no hay motor de layout) — queda para code review.
    const { container } = await renderPage(Page);

    const searchbox = screen.getByRole("searchbox");
    // Tienda y categoría dejaron de ser <select> en la barra superior: ahora
    // son secciones del panel de facetas. Lo que se ancla es su encabezado,
    // que es lo que está siempre en el documento —el contenido de una sección
    // plegada se desmonta.
    const storeSection = screen.getByRole("button", {
      name: new RegExp(`^${dict.storeFilterLabel}`),
    });
    const categorySection = screen.getByRole("button", {
      name: new RegExp(`^${dict.categoryFilterLabel}`),
    });
    // Por nombre y no a secas: el pie de página aporta su propia lista de
    // enlaces, así que "la lista" del documento ya no es única.
    const list = screen.getByRole("list", { name: dict.resultsListLabel });

    const allNodes = Array.from(container.querySelectorAll("*"));
    const indexOf = (node: Element) => allNodes.indexOf(node);

    const searchIndex = indexOf(searchbox);
    const storeIndex = indexOf(storeSection);
    const categoryIndex = indexOf(categorySection);
    const listIndex = indexOf(list);

    expect(searchIndex).toBeGreaterThanOrEqual(0);
    expect(storeIndex).toBeGreaterThanOrEqual(0);
    expect(categoryIndex).toBeGreaterThanOrEqual(0);
    expect(listIndex).toBeGreaterThanOrEqual(0);

    // el searchbox aparece estrictamente antes que ambos filtros
    expect(searchIndex).toBeLessThan(storeIndex);
    expect(searchIndex).toBeLessThan(categoryIndex);

    // ambos filtros aparecen estrictamente antes que la lista
    expect(storeIndex).toBeLessThan(listIndex);
    expect(categoryIndex).toBeLessThan(listIndex);

    // contraste con compareDocumentPosition: el searchbox precede a la lista
    expect(
      searchbox.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Tarea 39 ---------------------------------------------------------------
  describe("contrato de accesibilidad", () => {
    test("expone exactamente un h1", async () => {
      await renderPage(Page);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    test("expone un searchbox con nombre accesible", async () => {
      await renderPage(Page);
      expect(screen.getByRole("searchbox", { name: dict.searchPlaceholder })).toBeInTheDocument();
    });

    test("expone el orden como combobox y las facetas como grupos de radios", async () => {
      // El contrato original pedía tres comboboxes: tienda, categoría y orden.
      // Con el panel de facetas quedó uno solo. Tienda y categoría pasaron a
      // radios dentro de secciones plegables, porque el catálogo resuelve esos
      // dos filtros con un `=` en Postgres y sólo admite un valor: una lista de
      // opciones a la vista dice eso mejor que un desplegable que las esconde.
      await renderPage(Page);

      // guarda: las etiquetas no son accidentalmente el mismo string, lo que
      // haría vacua la aserción de "nombres distintos".
      const labels = [dict.storeFilterLabel, dict.categoryFilterLabel, dict.sortLabel];
      expect(new Set(labels).size).toBe(labels.length);

      // Las facetas siguen siendo alcanzables y anunciadas por su nombre.
      for (const facet of [dict.storeFilterLabel, dict.categoryFilterLabel]) {
        const section = screen.getByRole("button", { name: new RegExp(`^${facet}`) });
        expect(section).toHaveAttribute("aria-expanded");
        expect(section).toHaveAttribute("aria-controls");
      }

      const comboboxes = [screen.getByRole("combobox", { name: dict.sortLabel })];

      for (const combobox of comboboxes) {
        expect(combobox).toBeInTheDocument();
      }
      // El orden es el único desplegable que queda en la página.
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
    });

    test("expone una lista con un item por producto del fixture", async () => {
      await renderPage(Page);
      const list = screen.getByRole("list", { name: dict.resultsListLabel });
      expect(list).toBeInTheDocument();
      expect(within(list).getAllByRole("listitem")).toHaveLength(products.length);
    });

    test("expone un LocaleSwitcher con enlaces EN/ES alcanzables por nombre", async () => {
      await renderPage(Page);

      const enLink = screen.getByRole("link", { name: "EN" });
      const esLink = screen.getByRole("link", { name: "ES" });

      expect(enLink).toBeInTheDocument();
      expect(esLink).toBeInTheDocument();
      expect(enLink).not.toBe(esLink);
    });
  });
});

describe("cada ruta sirve su propio idioma", () => {
  test("guarda: en y es difieren en las claves bajo test", async () => {
    // Si no difirieran, comparar una ruta contra la otra sería vacuo.
    expect(en.searchPlaceholder).not.toBe(es.searchPlaceholder);
    expect(en.heroTagline).not.toBe(es.heroTagline);
  });

  test("/ renderiza la copia en español, no la inglesa", async () => {
    await renderPage(SpanishPage);

    expect(screen.getByRole("searchbox", { name: es.searchPlaceholder })).toBeInTheDocument();
    expect(screen.getByText(es.heroTagline)).toBeInTheDocument();
    expect(screen.queryByText(en.heroTagline)).not.toBeInTheDocument();
  });

  test("/en renderiza la copia en inglés, no la española", async () => {
    await renderPage(EnglishPage);

    expect(screen.getByRole("searchbox", { name: en.searchPlaceholder })).toBeInTheDocument();
    expect(screen.getByText(en.heroTagline)).toBeInTheDocument();
    expect(screen.queryByText(es.heroTagline)).not.toBeInTheDocument();
  });

  test("el LocaleSwitcher marca como actual el idioma de la ruta visible", async () => {
    const { unmount } = await renderPage(SpanishPage);
    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "EN" })).not.toHaveAttribute("aria-current");
    unmount();

    await renderPage(EnglishPage);
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "ES" })).not.toHaveAttribute("aria-current");
  });
});

describe("línea nativa del hero (voseo hondureño) — sólo en español", () => {
  test("/ la muestra bajo el título y fuera de cualquier heading", async () => {
    await renderPage(SpanishPage);

    expect(es.heroNativeTitle.length).toBeGreaterThan(0);

    const nativeNode = screen.getByText(es.heroNativeTitle);
    expect(nativeNode).toBeInTheDocument();
    expect(nativeNode.closest('[role="heading"], h1, h2, h3, h4, h5, h6')).toBeNull();
  });

  test("/en no muestra línea nativa: en inglés la clave está vacía a propósito", async () => {
    expect(en.heroNativeTitle).toBe("");

    await renderPage(EnglishPage);

    expect(screen.queryByText(es.heroNativeTitle)).not.toBeInTheDocument();
  });
});
