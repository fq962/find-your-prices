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
 */

import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SpanishPage from "@/app/(es)/page";
import EnglishPage from "@/app/en/page";
import { products } from "@/features/products/data";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";

const ROUTES = [
  { name: "/ (español, default)", Page: SpanishPage, dict: es },
  { name: "/en (inglés)", Page: EnglishPage, dict: en },
] as const;

describe.each(ROUTES)("Home $name", ({ Page, dict }) => {
  // Tarea 35 ---------------------------------------------------------------
  test("renderiza sin lanzar el error de LocaleProvider ausente", () => {
    expect(() => render(<Page />)).not.toThrow(
      "useLocale must be used within a LocaleProvider",
    );
  });

  // Tarea 37 ---------------------------------------------------------------
  test("renderiza nombres reales del fixture de productos", () => {
    render(<Page />);

    // Se toman entradas reales del fixture en vez de literales, para que el
    // test siga siendo correcto si el contenido del fixture cambia.
    const sample = [products[0], products[2], products[4]];
    expect(sample.every((p) => typeof p?.name === "string" && p.name.length > 0)).toBe(true);

    for (const product of sample) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
  });

  // Tarea 38 ---------------------------------------------------------------
  test("ordena searchbox, luego filtros, luego lista (apilado mobile-first)", () => {
    // NOTA: el número de columnas por breakpoint y el centrado visual no son
    // verificables en jsdom (no hay motor de layout) — queda para code review.
    const { container } = render(<Page />);

    const searchbox = screen.getByRole("searchbox");
    const storeCombobox = screen.getByRole("combobox", { name: dict.storeFilterLabel });
    const categoryCombobox = screen.getByRole("combobox", {
      name: dict.categoryFilterLabel,
    });
    const list = screen.getByRole("list");

    const allNodes = Array.from(container.querySelectorAll("*"));
    const indexOf = (node: Element) => allNodes.indexOf(node);

    const searchIndex = indexOf(searchbox);
    const storeIndex = indexOf(storeCombobox);
    const categoryIndex = indexOf(categoryCombobox);
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
    test("expone exactamente un h1", () => {
      render(<Page />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    test("expone un searchbox con nombre accesible", () => {
      render(<Page />);
      expect(screen.getByRole("searchbox", { name: dict.searchPlaceholder })).toBeInTheDocument();
    });

    test("expone tres comboboxes (tienda, categoría, orden) con nombres distintos", () => {
      // El contrato original de la Tarea 39 pedía dos; el criterio de orden
      // se sumó después como tercer control de la barra.
      render(<Page />);

      // guarda: las tres etiquetas no son accidentalmente el mismo string, lo
      // que haría vacua la aserción de "nombres distintos".
      const labels = [dict.storeFilterLabel, dict.categoryFilterLabel, dict.sortLabel];
      expect(new Set(labels).size).toBe(labels.length);

      const comboboxes = labels.map((name) => screen.getByRole("combobox", { name }));

      for (const combobox of comboboxes) {
        expect(combobox).toBeInTheDocument();
      }
      expect(new Set(comboboxes).size).toBe(labels.length);
      expect(screen.getAllByRole("combobox")).toHaveLength(labels.length);
    });

    test("expone una lista con un item por producto del fixture", () => {
      render(<Page />);
      const list = screen.getByRole("list");
      expect(list).toBeInTheDocument();
      expect(within(list).getAllByRole("listitem")).toHaveLength(products.length);
    });

    test("expone un LocaleSwitcher con enlaces EN/ES alcanzables por nombre", () => {
      render(<Page />);

      const enLink = screen.getByRole("link", { name: "EN" });
      const esLink = screen.getByRole("link", { name: "ES" });

      expect(enLink).toBeInTheDocument();
      expect(esLink).toBeInTheDocument();
      expect(enLink).not.toBe(esLink);
    });
  });
});

describe("cada ruta sirve su propio idioma", () => {
  test("guarda: en y es difieren en las claves bajo test", () => {
    // Si no difirieran, comparar una ruta contra la otra sería vacuo.
    expect(en.searchPlaceholder).not.toBe(es.searchPlaceholder);
    expect(en.heroTagline).not.toBe(es.heroTagline);
  });

  test("/ renderiza la copia en español, no la inglesa", () => {
    render(<SpanishPage />);

    expect(screen.getByRole("searchbox", { name: es.searchPlaceholder })).toBeInTheDocument();
    expect(screen.getByText(es.heroTagline)).toBeInTheDocument();
    expect(screen.queryByText(en.heroTagline)).not.toBeInTheDocument();
  });

  test("/en renderiza la copia en inglés, no la española", () => {
    render(<EnglishPage />);

    expect(screen.getByRole("searchbox", { name: en.searchPlaceholder })).toBeInTheDocument();
    expect(screen.getByText(en.heroTagline)).toBeInTheDocument();
    expect(screen.queryByText(es.heroTagline)).not.toBeInTheDocument();
  });

  test("el LocaleSwitcher marca como actual el idioma de la ruta visible", () => {
    const { unmount } = render(<SpanishPage />);
    expect(screen.getByRole("link", { name: "ES" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "EN" })).not.toHaveAttribute("aria-current");
    unmount();

    render(<EnglishPage />);
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "ES" })).not.toHaveAttribute("aria-current");
  });
});

describe("línea nativa del hero (voseo hondureño) — sólo en español", () => {
  test("/ la muestra bajo el título y fuera de cualquier heading", () => {
    render(<SpanishPage />);

    expect(es.heroNativeTitle.length).toBeGreaterThan(0);

    const nativeNode = screen.getByText(es.heroNativeTitle);
    expect(nativeNode).toBeInTheDocument();
    expect(nativeNode.closest('[role="heading"], h1, h2, h3, h4, h5, h6')).toBeNull();
  });

  test("/en no muestra línea nativa: en inglés la clave está vacía a propósito", () => {
    expect(en.heroNativeTitle).toBe("");

    render(<EnglishPage />);

    expect(screen.queryByText(es.heroNativeTitle)).not.toBeInTheDocument();
  });
});
