/**
 * __tests__/page.test.tsx
 * ---------------------------------------------------------------------------
 * RED phase tests for tasks 35, 37, 38 and 39 of the Planner's list.
 *
 * CONTRACT THIS TEST FILE DEFINES FOR THE IMPLEMENTER (src/app/page.tsx)
 * ---------------------------------------------------------------------------
 * File under test: src/app/page.tsx (today a placeholder: a bare
 * `<div className="flex flex-1" />`, no imports, no i18n, no products).
 *
 * The Implementer must turn it into a page that, when rendered:
 *
 *   1. Wraps the whole interactive tree in `<LocaleProvider>`
 *      (@/features/i18n/LocaleContext) so that every client component that
 *      calls `useLocale()` (Hero, LocaleSwitcher, SearchBar, StoreFilter,
 *      CategoryFilter, ProductGrid's children, ProductSearchApp) can resolve
 *      it without throwing "useLocale must be used within a LocaleProvider".
 *
 *   2. Renders a `<LocaleSwitcher />` (@/features/i18n/LocaleSwitcher)
 *      somewhere in the tree: it is the only control that makes the i18n
 *      support usable, and it exposes two buttons with accessible names
 *      "EN" and "ES".
 *
 *   3. Renders exactly one `<h1>` (the site title, produced by `<Hero />`,
 *      @/features/products/components/Hero), translated via the real
 *      dictionaries (@/features/i18n/dictionaries/{en,es}).
 *
 *   4. Feeds the real product fixture (@/features/products/data → `products`)
 *      into `<ProductSearchApp initialProducts={products} />`
 *      (@/features/products/components/ProductSearchApp), which in turn
 *      renders (per its own already-frozen contract):
 *        - a `searchbox` (SearchBar) named after `t("searchPlaceholder")`,
 *        - two `combobox`es (StoreFilter / CategoryFilter) named after
 *          `t("storeFilterLabel")` / `t("categoryFilterLabel")`,
 *        - a `list` (ProductGrid's <ul>) with one `listitem` per product.
 *
 *   5. DOM order (mobile-first stacking, top to bottom) must be:
 *        searchbox  →  (store combobox, category combobox)  →  list
 *      Column count per breakpoint (`sm:grid-cols-2`, `lg:grid-cols-3`, ...)
 *      and visual centering are NOT verifiable in jsdom (no real layout
 *      engine) and are explicitly left for code review, not for this suite.
 *
 * `src/app/page.tsx` has no "use client" (Server Component) but mounts
 * client components underneath. Empirically, `render(<Page />)` from
 * `@testing-library/react` handles this fine in this Vitest + jsdom setup
 * (Next's RSC boundary isn't enforced by the Vite/Vitest transform), so no
 * async server-component gymnastics are needed here. If that assumption
 * turns out to be wrong once `Page` has real content, the failure will
 * surface as an execution/rendering error, not a "not implemented" one —
 * that would need to be reported back, not worked around.
 *
 * DEBOUNCE: none of the tests below type into the search box, so fake
 * timers are not needed here (SearchBar's 300ms debounce, via
 * `useDebounce`, is exercised by ProductSearchApp.test.tsx instead).
 */

import { describe, expect, test } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import Page from "@/app/page";
import { products } from "@/features/products/data";
import { en } from "@/features/i18n/dictionaries/en";
import { es } from "@/features/i18n/dictionaries/es";

describe("Home page (src/app/page.tsx)", () => {
  // Task 35 -----------------------------------------------------------------
  // Today this passes trivially (the placeholder has no `useLocale`
  // consumers at all), but it must keep passing once the real interactive
  // tree (Hero, LocaleSwitcher, SearchBar, filters, ProductSearchApp) is
  // mounted underneath a `LocaleProvider`. It is a regression guard for the
  // moment those consumers exist, not proof that they exist yet — that is
  // covered by the other tests below, which DO fail today.
  test("renders without throwing the 'useLocale must be used within a LocaleProvider' error", () => {
    expect(() => render(<Page />)).not.toThrow(
      "useLocale must be used within a LocaleProvider",
    );
  });

  // Task 37 -------------------------------------------------------------
  test("renders real product names from the products fixture", () => {
    render(<Page />);

    // Pull real fixture entries instead of hardcoding literals, so this
    // test keeps being correct if the fixture's content changes.
    const sample = [products[0], products[2], products[4]];
    expect(sample.every((p) => typeof p?.name === "string" && p.name.length > 0)).toBe(
      true,
    );

    for (const product of sample) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
  });

  // Task 38 -------------------------------------------------------------
  test("lays out searchbox, then filters, then results list, in that DOM order (mobile-first stacking)", () => {
    // NOTE: number of grid columns per breakpoint and visual centering are
    // not verifiable in jsdom (no layout engine) — left for code review.
    const { container } = render(<Page />);

    const searchbox = screen.getByRole("searchbox");
    const storeCombobox = screen.getByRole("combobox", { name: en.storeFilterLabel });
    const categoryCombobox = screen.getByRole("combobox", {
      name: en.categoryFilterLabel,
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

    // searchbox appears strictly before both filters
    expect(searchIndex).toBeLessThan(storeIndex);
    expect(searchIndex).toBeLessThan(categoryIndex);

    // both filters appear strictly before the results list
    expect(storeIndex).toBeLessThan(listIndex);
    expect(categoryIndex).toBeLessThan(listIndex);

    // cross-check with compareDocumentPosition: searchbox precedes the list
    // eslint-disable-next-line no-bitwise
    expect(
      searchbox.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Task 39 -------------------------------------------------------------
  describe("accessibility contract", () => {
    test("exposes exactly one h1", () => {
      render(<Page />);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    test("exposes a searchbox with an accessible name", () => {
      render(<Page />);
      const searchbox = screen.getByRole("searchbox", { name: en.searchPlaceholder });
      expect(searchbox).toBeInTheDocument();
    });

    test("exposes two comboboxes (store, category) with distinct accessible names", () => {
      render(<Page />);

      // guard: the two labels this assertion relies on aren't accidentally
      // the same string, which would make "distinct names" vacuous.
      expect(en.storeFilterLabel).not.toBe(en.categoryFilterLabel);

      const storeCombobox = screen.getByRole("combobox", { name: en.storeFilterLabel });
      const categoryCombobox = screen.getByRole("combobox", {
        name: en.categoryFilterLabel,
      });

      expect(storeCombobox).toBeInTheDocument();
      expect(categoryCombobox).toBeInTheDocument();
      expect(storeCombobox).not.toBe(categoryCombobox);
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    test("exposes a results list", () => {
      render(<Page />);
      const list = screen.getByRole("list");
      expect(list).toBeInTheDocument();
      // one listitem per fixture product, since no filter has been applied
      expect(within(list).getAllByRole("listitem")).toHaveLength(products.length);
    });

    test("exposes a LocaleSwitcher with EN/ES buttons by accessible name", () => {
      render(<Page />);

      const enButton = screen.getByRole("button", { name: "EN" });
      const esButton = screen.getByRole("button", { name: "ES" });

      expect(enButton).toBeInTheDocument();
      expect(esButton).toBeInTheDocument();
      expect(enButton).not.toBe(esButton);
    });
  });

  // Cross-cutting: the LocaleSwitcher must actually drive the translated
  // copy rendered by the page (otherwise it would be present but inert).
  test("switching locale via the LocaleSwitcher updates translated copy on the page", () => {
    // guard: the two dictionaries must actually differ for the key under
    // test, otherwise comparing "before" vs "after" text would be vacuous.
    expect(en.searchPlaceholder).not.toBe(es.searchPlaceholder);
    expect(en.searchPlaceholder.length).toBeGreaterThan(0);
    expect(es.searchPlaceholder.length).toBeGreaterThan(0);

    render(<Page />);

    // Before: default locale copy is visible.
    expect(
      screen.getByRole("searchbox", { name: en.searchPlaceholder }),
    ).toBeInTheDocument();

    const esButton = screen.getByRole("button", { name: "ES" });
    fireEvent.click(esButton);

    // After: the searchbox's accessible name must follow the es dictionary.
    expect(
      screen.getByRole("searchbox", { name: es.searchPlaceholder }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("searchbox", { name: en.searchPlaceholder }),
    ).not.toBeInTheDocument();
  });
});
