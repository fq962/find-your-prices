"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { Product } from "@/types";
import { useLocale } from "@/features/i18n/LocaleContext";
import { filterProducts, getFacets } from "@/features/products/filterProducts";
import { DEFAULT_SORT, sortProducts, type SortOption } from "@/features/products/sortProducts";
import { SearchBar } from "./SearchBar";
import { StoreFilter } from "./StoreFilter";
import { CategoryFilter } from "./CategoryFilter";
import { SortFilter } from "./SortFilter";
import { ProductGrid } from "./ProductGrid";

export interface ProductSearchAppProps {
  initialProducts: Product[];
}

export function ProductSearchApp({ initialProducts }: ProductSearchAppProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [store, setStore] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);

  const { stores, categories } = useMemo(() => getFacets(initialProducts), [initialProducts]);

  const visibleProducts = useMemo(
    () => sortProducts(filterProducts(initialProducts, { query, store, category }), sort),
    [initialProducts, query, store, category, sort],
  );

  // El orden no cuenta como filtro: no recorta resultados, sólo los reordena.
  const hasActiveFilters = store !== undefined || category !== undefined;

  const resultsLabel =
    visibleProducts.length === 1 ? t("resultsCountOne") : t("resultsCountMany");

  function clearFilters() {
    setStore(undefined);
    setCategory(undefined);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* La barra se pega bajo la navegación y toma el fondo del contenido con
          blur, para que la lista pase por debajo sin cortarse. La búsqueda
          ocupa su propia línea: es la acción principal y necesita el ancho
          completo; los selectores viven en la línea de abajo. */}
      <div
        className="enter sticky top-14 z-30 -mx-4 flex flex-col gap-2.5 bg-[var(--glass)] px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:border-[var(--border)] sm:px-3"
        style={{ "--enter-delay": "560ms" } as CSSProperties}
      >
        <SearchBar onQueryChange={setQuery} />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <StoreFilter stores={stores} selectedStore={store} onChange={setStore} />
          <CategoryFilter
            categories={categories}
            selectedCategory={category}
            onChange={setCategory}
          />
          <div className="col-span-2 sm:col-span-1">
            <SortFilter selectedSort={sort} onChange={setSort} />
          </div>
        </div>
      </div>

      {/* Línea de estado: cuántos resultados quedaron y, sólo cuando hace
          falta, la salida rápida de vuelta al catálogo completo. */}
      <div className="flex min-h-8 items-center justify-between gap-4 px-1">
        <p
          aria-live="polite"
          className="text-[0.8125rem] tracking-[0.005em] text-[var(--text-tertiary)] tabular-nums"
        >
          {visibleProducts.length} {resultsLabel}
        </p>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="group flex shrink-0 items-center gap-1.5 rounded-full text-[0.8125rem] font-medium text-[var(--accent)] transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:opacity-70"
            style={{ animation: "fyp-fade 260ms var(--ease-out-quart) both" }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              className="h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:rotate-90"
            >
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
            {t("clearFiltersLabel")}
          </button>
        )}
      </div>

      <ProductGrid
        products={visibleProducts}
        emptyMessage={t("noResultsMessage")}
        viewLargerImageLabel={t("viewLargerImageLabel")}
        closeImageLabel={t("closeImageLabel")}
      />
    </div>
  );
}
