/**
 * ProductSearchApp.test.tsx
 * ---------------------------------------------------------------------------
 * RED phase tests for tasks 27-32 of the Planner's list.
 *
 * CONTRACT THIS TEST FILE DEFINES FOR THE IMPLEMENTER
 * ---------------------------------------------------------------------------
 * File under test (does not exist yet, must be created by the Implementer):
 *   src/features/products/components/ProductSearchApp.tsx
 *
 *   "use client";
 *   export function ProductSearchApp({ initialProducts }: { initialProducts: Product[] })
 *
 *   - Keeps state for `query`, `store` and `category` (store/category start
 *     undefined, i.e. "todas").
 *   - Derives the available facets from `initialProducts` via
 *     `getFacets(initialProducts)` and passes `stores`/`categories` down to
 *     <StoreFilter /> / <CategoryFilter />.
 *   - Filters with `filterProducts(initialProducts, { query, store, category })`.
 *     Does NOT reimplement matching/filtering logic itself.
 *   - Renders (at least): <SearchBar onQueryChange={...} />,
 *     <StoreFilter stores={...} selectedStore={store} onChange={setStore} />,
 *     <CategoryFilter categories={...} selectedCategory={category} onChange={setCategory} />,
 *     <ProductGrid products={filtered} emptyMessage={t("noResultsMessage")} />.
 *   - <Hero /> is out of scope for this file: none of the assertions below
 *     depend on it, so its presence/absence does not affect this suite.
 *
 * VERIFIED FILE LOCATIONS (checked directly against the real codebase):
 *   - src/features/products/components/SearchBar.tsx
 *   - src/features/products/components/StoreFilter.tsx
 *   - src/features/products/components/CategoryFilter.tsx
 *   - src/features/products/components/ProductGrid.tsx
 *   - src/features/i18n/LocaleContext.tsx  (LocaleProvider, useLocale)
 *   - src/types/index.ts                   (Product)
 *   - src/features/products/filterProducts.ts is NOT imported directly by
 *     this test file: ProductSearchApp is exercised end-to-end through the
 *     DOM instead, since filterProducts/getFacets are already covered by
 *     their own (green) test suite and must not be re-tested here.
 *
 * CORRECTION NOTE: an earlier draft of this file was written without access
 * to the real repository and guessed two import paths that turned out to be
 * wrong: it assumed `LocaleProvider`/`useLocale` lived at
 * `features/products/LocaleContext.tsx` (real location:
 * `@/features/i18n/LocaleContext`) and that `Product` lived at
 * `features/products/types.ts` (that file does not exist; `Product` lives at
 * `@/types`). That draft also claimed `Product` "only has id/name/imageUrl
 * and must be extended" with `store`/`category` — this was already false at
 * the time and is now corrected: the real `Product` type already has
 * `id, name, price, currency, store, category` (plus optional `imageUrl`,
 * `availability`, `description`), verified green against
 * `src/features/products/data.test.ts`. No extension is needed for
 * getFacets()/filterProducts() to work. Both the imports below and this
 * block have been fixed accordingly; no assertions or test cases changed.
 *
 * TRANSLATION STRATEGY
 * ---------------------------------------------------------------------------
 * No dictionary file path was specified in the frozen contracts handed to
 * this agent. Instead of guessing one, expected copy is obtained from the
 * REAL `useLocale().t` function (via a tiny probe component rendered inside
 * the real <LocaleProvider>), so assertions never hardcode literal English
 * text and stay correct regardless of which locale is the default.
 *
 * DEBOUNCE
 * ---------------------------------------------------------------------------
 * SearchBar debounces via `useDebounce` (src/hooks/useDebounce.ts, default
 * delay = 300ms) and must not fire on mount. Fake timers are used and
 * advanced inside `act(...)`.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, useEffect } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProductSearchApp } from "./ProductSearchApp";
import { LocaleProvider, useLocale } from "@/features/i18n/LocaleContext";
import type { Product } from "@/types";
import type { DictionaryKey } from "@/features/i18n/translate";

const DEBOUNCE_MS = 300; // must match src/hooks/useDebounce.ts default delay

const PRODUCTS: Product[] = [
  { id: "p1", name: "Wireless Mouse Alpha", price: 19.99, currency: "USD", store: "Amazon", category: "Electronics" },
  { id: "p2", name: "Wireless Mouse Beta", price: 21.99, currency: "USD", store: "Target", category: "Electronics" },
  { id: "p3", name: "Wireless Keyboard Gamma", price: 39.99, currency: "USD", store: "Amazon", category: "Accessories" },
  { id: "p4", name: "Garden Hose Delta", price: 14.99, currency: "USD", store: "Amazon", category: "Garden" },
  { id: "p5", name: "Coffee Mug Epsilon", price: 9.99, currency: "USD", store: "Target", category: "Kitchen" },
];

let t: (key: DictionaryKey) => string;

function TranslationProbe() {
  const locale = useLocale();
  // Reassigning the module-scoped `t` must happen in an effect, not during
  // render: mutating an outer binding while rendering is a side effect and
  // is rejected by the react-hooks/globals rule (render must stay pure).
  // Running the assignment inside useEffect keeps render pure while still
  // exposing the real `t` from useLocale() to the module-level test helpers
  // (getSearchInput, getStoreSelect, etc.) and to the assertions themselves.
  useEffect(() => {
    t = locale.t;
  }, [locale]);
  return null;
}

function renderApp(products: Product[] = PRODUCTS) {
  return render(
    <LocaleProvider>
      <ProductSearchApp initialProducts={products} />
    </LocaleProvider>,
  );
}

function getSearchInput() {
  return screen.getByRole("searchbox", { name: t("searchPlaceholder") });
}

function getStoreSelect() {
  return screen.getByRole("combobox", { name: t("storeFilterLabel") });
}

function getCategorySelect() {
  return screen.getByRole("combobox", { name: t("categoryFilterLabel") });
}

function typeQuery(value: string) {
  fireEvent.change(getSearchInput(), { target: { value } });
  act(() => {
    vi.advanceTimersByTime(DEBOUNCE_MS);
  });
}

function selectStore(value: string) {
  fireEvent.change(getStoreSelect(), { target: { value } });
}

function selectCategory(value: string) {
  fireEvent.change(getCategorySelect(), { target: { value } });
}

function getListItems() {
  const list = screen.getByRole("list");
  return within(list).queryAllByRole("listitem");
}

beforeEach(() => {
  vi.useFakeTimers();
  // Capture the real `t` from the real LocaleContext so assertions below
  // never compare against hardcoded literals.
  render(
    <LocaleProvider>
      <TranslationProbe />
    </LocaleProvider>,
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProductSearchApp", () => {
  // Task 27
  test("renders all initial products, an empty search box and both filters set to 'todas'", () => {
    renderApp();

    for (const product of PRODUCTS) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
    expect(getListItems()).toHaveLength(PRODUCTS.length);

    expect(getSearchInput()).toHaveValue("");

    const storeSelect = getStoreSelect();
    expect(storeSelect).toHaveValue("");
    const storeAllOption = within(storeSelect).getByRole("option", {
      name: t("filterAllOption"),
    }) as HTMLOptionElement;
    expect(storeAllOption.value).toBe("");

    const categorySelect = getCategorySelect();
    expect(categorySelect).toHaveValue("");
    const categoryAllOption = within(categorySelect).getByRole("option", {
      name: t("filterAllOption"),
    }) as HTMLOptionElement;
    expect(categoryAllOption.value).toBe("");
  });

  // Task 28
  test("typing in the search box narrows the grid to name matches, but only after the debounce", () => {
    renderApp();

    // guard: matching and non-matching products are present before filtering
    expect(screen.getByText("Wireless Mouse Alpha")).toBeInTheDocument();
    expect(screen.getByText("Garden Hose Delta")).toBeInTheDocument();
    expect(screen.getByText("Coffee Mug Epsilon")).toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: "Wireless" } });

    // guard: nothing should be filtered out yet, the debounce hasn't elapsed
    expect(screen.getByText("Garden Hose Delta")).toBeInTheDocument();
    expect(screen.getByText("Coffee Mug Epsilon")).toBeInTheDocument();
    expect(getListItems()).toHaveLength(PRODUCTS.length);

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(screen.getByText("Wireless Mouse Alpha")).toBeInTheDocument();
    expect(screen.getByText("Wireless Mouse Beta")).toBeInTheDocument();
    expect(screen.getByText("Wireless Keyboard Gamma")).toBeInTheDocument();
    expect(screen.queryByText("Garden Hose Delta")).not.toBeInTheDocument();
    expect(screen.queryByText("Coffee Mug Epsilon")).not.toBeInTheDocument();
    expect(getListItems()).toHaveLength(3);
  });

  // Task 29
  test("store filter combines with the active query (AND)", () => {
    renderApp();
    typeQuery("Wireless");

    // guard: the Target match is present before the store filter is applied
    expect(screen.getByText("Wireless Mouse Beta")).toBeInTheDocument();

    selectStore("Amazon");

    expect(screen.getByText("Wireless Mouse Alpha")).toBeInTheDocument();
    expect(screen.getByText("Wireless Keyboard Gamma")).toBeInTheDocument();
    // matches the query but is sold at Target, not Amazon
    expect(screen.queryByText("Wireless Mouse Beta")).not.toBeInTheDocument();
    // sold at Amazon but doesn't match the query
    expect(screen.queryByText("Garden Hose Delta")).not.toBeInTheDocument();
    expect(getListItems()).toHaveLength(2);
  });

  // Task 30
  test("category filter combines with query and store (all three at once)", () => {
    renderApp();
    typeQuery("Wireless");
    selectStore("Amazon");

    // guard: the Accessories match is present before the category filter is applied
    expect(screen.getByText("Wireless Keyboard Gamma")).toBeInTheDocument();
    expect(getListItems()).toHaveLength(2);

    selectCategory("Electronics");

    expect(screen.getByText("Wireless Mouse Alpha")).toBeInTheDocument();
    // matches query + store but is in the Accessories category
    expect(screen.queryByText("Wireless Keyboard Gamma")).not.toBeInTheDocument();
    expect(getListItems()).toHaveLength(1);
  });

  // Task 31
  test("a query + store + category combination with no matches shows the empty message and no list items", () => {
    renderApp();
    typeQuery("Wireless");
    selectStore("Amazon");

    // guard: results still exist before the impossible category is applied
    expect(getListItems().length).toBeGreaterThan(0);

    // Amazon + Garden exists (Garden Hose Delta), but it doesn't match "Wireless":
    // no product satisfies query AND store AND category simultaneously.
    selectCategory("Garden");

    expect(getListItems()).toHaveLength(0);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText(t("noResultsMessage"))).toBeInTheDocument();
  });

  // Task 32
  test("resetting the query and both filters back to 'todas' restores the full list", () => {
    renderApp();
    typeQuery("Wireless");
    selectStore("Amazon");
    selectCategory("Electronics");

    // guard: filters are actually applied before resetting
    expect(getListItems()).toHaveLength(1);

    typeQuery("");
    selectStore("");
    selectCategory("");

    for (const product of PRODUCTS) {
      expect(screen.getByText(product.name)).toBeInTheDocument();
    }
    expect(getListItems()).toHaveLength(PRODUCTS.length);
    expect(getSearchInput()).toHaveValue("");
    expect(getStoreSelect()).toHaveValue("");
    expect(getCategorySelect()).toHaveValue("");
  });
});
