"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  /**
   * Facetas completas del catálogo. Sin esto se deducen de `initialProducts`,
   * que es lo correcto para un fixture pero no para un catálogo real: los
   * filtros solo ofrecerían lo que ya está a la vista.
   */
  stores?: string[];
  categories?: string[];
  /**
   * Resuelve la búsqueda en el servidor sobre el catálogo completo. Con el
   * fixture queda apagado y todo se filtra en memoria, igual que antes.
   */
  remoteSearch?: boolean;
  locale?: string;
}

/** Espera antes de consultar: evita una petición por cada tecla. */
const SEARCH_DEBOUNCE_MS = 260;

/**
 * Locale de formato de precio, derivado del idioma de la interfaz.
 *
 * El catálogo es hondureño y la moneda es el lempira. Con `es` a secas,
 * Intl imprime "299,00 HNL"; con `es-HN` imprime "L 299.00", que es como se
 * escribe un precio en Honduras. Se resuelve acá y no en formatPrice para no
 * tocar el contrato de esa función, que ya tiene pruebas de caracterización.
 */
const PRICE_LOCALES: Record<string, string> = {
  es: "es-HN",
  en: "en-HN",
};

export function ProductSearchApp({
  initialProducts,
  stores: storesProp,
  categories: categoriesProp,
  remoteSearch = false,
  locale,
}: ProductSearchAppProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [store, setStore] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);

  const [remoteProducts, setRemoteProducts] = useState<Product[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Sin locale explícito se deja que ProductCard use su default: es lo que
  // esperan las pruebas del componente, que lo montan sin idioma.
  const priceLocale = locale ? (PRICE_LOCALES[locale] ?? locale) : undefined;

  const derivedFacets = useMemo(() => getFacets(initialProducts), [initialProducts]);
  const stores = storesProp ?? derivedFacets.stores;
  const categories = categoriesProp ?? derivedFacets.categories;

  // Descarta respuestas de búsquedas ya superadas: sin esto, una consulta lenta
  // puede llegar después de otra más nueva y pisar resultados correctos.
  const requestSeq = useRef(0);

  const hasCriteria = query.trim() !== "" || store !== undefined || category !== undefined;

  useEffect(() => {
    // Sin criterios no se consulta nada: el render se queda con el lote curado
    // que sirvió el servidor. No hace falta limpiar estado acá — más abajo se
    // ignoran los resultados remotos cuando no hay criterios, que es más
    // barato y evita un render en cascada.
    if (!remoteSearch || !hasCriteria) return;

    const seq = ++requestSeq.current;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (store) params.set("store", store);
      if (category) params.set("category", category);
      params.set("sort", sort);
      if (locale) params.set("locale", locale);

      try {
        const response = await fetch(`/api/products/search?${params}`);
        const payload = await response.json();
        if (seq !== requestSeq.current) return;
        setRemoteProducts(Array.isArray(payload.products) ? payload.products : []);
      } catch {
        if (seq !== requestSeq.current) return;
        setRemoteProducts([]);
      } finally {
        if (seq === requestSeq.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [remoteSearch, hasCriteria, query, store, category, sort, locale]);

  const visibleProducts = useMemo(() => {
    // Con resultados del servidor el filtrado ya vino aplicado; solo se ordena
    // en el cliente para que cambiar el orden se sienta instantáneo. Los
    // resultados remotos solo cuentan mientras haya criterios: al borrar la
    // búsqueda se vuelve al lote inicial sin esperar a ningún efecto.
    if (remoteSearch && hasCriteria && remoteProducts !== null) {
      return sortProducts(remoteProducts, sort);
    }
    return sortProducts(filterProducts(initialProducts, { query, store, category }), sort);
  }, [remoteSearch, hasCriteria, remoteProducts, initialProducts, query, store, category, sort]);

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
          className="flex items-center gap-2 text-[0.8125rem] tracking-[0.005em] text-[var(--text-tertiary)] tabular-nums"
        >
          {/* El punto pulsa mientras hay una consulta en vuelo: da señal de que
              algo está pasando sin cambiar la cifra ya visible por un spinner. */}
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full transition-opacity duration-[var(--dur-base)] ${
              isSearching && hasCriteria ? "bg-[var(--accent)] opacity-100" : "opacity-0"
            }`}
            style={
              isSearching && hasCriteria
                ? { animation: "fyp-pulse 1.1s var(--ease-in-out-expo) infinite" }
                : undefined
            }
          />
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
        locale={priceLocale}
        emptyMessage={t("noResultsMessage")}
        viewLargerImageLabel={t("viewLargerImageLabel")}
        closeImageLabel={t("closeImageLabel")}
      />
    </div>
  );
}
