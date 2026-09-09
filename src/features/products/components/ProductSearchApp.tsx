"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { Product } from "@/types";
import type { FacetOption } from "@/server/services/catalog";
import { useLocale } from "@/features/i18n/LocaleContext";
import { filterProducts, getFacets } from "@/features/products/filterProducts";
import { productPath } from "@/features/products/productPath";
import { DEFAULT_SORT, sortProducts, type SortOption } from "@/features/products/sortProducts";
import {
  clampCompareColumns,
  getViewPreferencesServerSnapshot,
  getViewPreferencesSnapshot,
  MAX_COMPARE_COLUMNS,
  subscribeToViewPreferences,
  writeViewPreferences,
  type Density,
  type ViewMode,
} from "@/features/products/viewPreferences";
import { useStoreComparison } from "@/features/products/useStoreComparison";
import { SearchBar } from "./SearchBar";
import { StoreFilter } from "./StoreFilter";
import { CategoryFilter } from "./CategoryFilter";
import { SortFilter } from "./SortFilter";
import { ProductGrid } from "./ProductGrid";
import { CatalogControls } from "./CatalogControls";
import { CompareBar } from "./CompareBar";
import { CompareGrid } from "./CompareGrid";
import {
  countActiveFilters,
  EMPTY_FILTER_STATE,
  FilterPanel,
  type CatalogFilterState,
} from "./FilterPanel";

export interface ProductSearchAppProps {
  initialProducts: Product[];
  /**
   * Facetas completas del catálogo, con el conteo de cada opción. Sin esto se
   * deducen de `initialProducts`, que es lo correcto para un fixture pero no
   * para un catálogo real: los filtros solo ofrecerían lo que ya está a la
   * vista.
   */
  storeFacets?: FacetOption[];
  categoryFacets?: FacetOption[];
  brandFacets?: FacetOption[];
  priceBounds?: { min: number; max: number };
  /** Total de artículos que cumplen los filtros, contado en la base. */
  totalResults?: number;
  /**
   * Resuelve búsqueda y filtros en el servidor sobre el catálogo completo. Con
   * el fixture queda apagado y todo se filtra en memoria, igual que antes.
   */
  remoteSearch?: boolean;
  locale?: string;
}

/** Espera antes de consultar: evita una petición por cada tecla. */
const SEARCH_DEBOUNCE_MS = 260;

/** Artículos por página. */
const PAGE_SIZE = 60;

/**
 * Locale de formato de precio, derivado del idioma de la interfaz.
 *
 * El catálogo es hondureño y la moneda es el lempira. Con `es` a secas, Intl
 * imprime "299,00 HNL"; con `es-HN` imprime "L 299.00", que es como se escribe
 * un precio en Honduras. Se resuelve acá y no en formatPrice para no tocar el
 * contrato de esa función, que ya tiene pruebas de caracterización.
 */
const PRICE_LOCALES: Record<string, string> = {
  es: "es-HN",
  en: "en-HN",
};

export function ProductSearchApp({
  initialProducts,
  storeFacets,
  categoryFacets,
  brandFacets,
  priceBounds,
  totalResults,
  remoteSearch = false,
  locale,
}: ProductSearchAppProps) {
  const { t } = useLocale();

  const [query, setQuery] = useState("");
  const [store, setStore] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
  const [filters, setFilters] = useState<CatalogFilterState>(EMPTY_FILTER_STATE);
  const [showFilters, setShowFilters] = useState(false);
  /**
   * Tienda de cada columna de comparación, por posición. Se guardan las cuatro
   * aunque se vean menos: bajar de 4 a 2 columnas y volver a subir no debería
   * borrar lo que ya se había elegido.
   *
   * `null` significa "nadie ha tocado esto todavía", que no es lo mismo que
   * "las cuatro vacías": con `null` mandan las tiendas sembradas por defecto, y
   * en cuanto se elige una vez el array pasa a ser la verdad, incluso si se
   * deja alguna columna en blanco a propósito.
   */
  const [compareStores, setCompareStores] = useState<(string | undefined)[] | null>(null);

  const [remoteProducts, setRemoteProducts] = useState<Product[] | null>(null);
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);

  // Las preferencias viven en localStorage, que es estado externo y mutable:
  // useSyncExternalStore es la herramienta para eso. En el servidor devuelve
  // los valores por defecto, así que el HTML servidor/cliente coincide y no hay
  // fallo de hidratación; React reconcilia con el valor real tras montar.
  const view = useSyncExternalStore(
    subscribeToViewPreferences,
    getViewPreferencesSnapshot,
    getViewPreferencesServerSnapshot,
  );

  const updateView = useCallback(
    (next: { mode?: ViewMode; density?: Density; compareColumns?: number }) => {
      writeViewPreferences({ ...view, ...next });
    },
    [view],
  );

  const isComparing = view.mode === "compare";
  /** Modo que entiende la retícula: comparar no es uno de sus modos. */
  const gridMode = view.mode === "compare" ? "list" : view.mode;

  // Sin locale explícito se deja que ProductCard use su default: es lo que
  // esperan las pruebas del componente, que lo montan sin idioma.
  const priceLocale = locale ? (PRICE_LOCALES[locale] ?? locale) : undefined;

  // La ruta de la ficha se arma acá y no la pasa el servidor: React no deja
  // cruzar funciones de un Server Component a uno cliente. Con el fixture no
  // hay ficha que enlazar —esos ids no existen en la base—, así que se deja sin
  // enlace y el nombre sigue llevando a la tienda.
  const productHref = useMemo(
    () =>
      remoteSearch && locale
        ? (product: Product) => productPath(locale === "en" ? "en" : "es", product.id)
        : undefined,
    [remoteSearch, locale],
  );

  const derivedFacets = useMemo(() => getFacets(initialProducts), [initialProducts]);
  const stores = useMemo(
    () => storeFacets?.map((facet) => facet.value) ?? derivedFacets.stores,
    [storeFacets, derivedFacets],
  );
  const categories = useMemo(
    () => categoryFacets?.map((facet) => facet.value) ?? derivedFacets.categories,
    [categoryFacets, derivedFacets],
  );

  const storeCounts = useMemo(
    () => Object.fromEntries((storeFacets ?? []).map((facet) => [facet.value, facet.count])),
    [storeFacets],
  );
  const categoryCounts = useMemo(
    () => Object.fromEntries((categoryFacets ?? []).map((facet) => [facet.value, facet.count])),
    [categoryFacets],
  );

  // ---------------------------------------------------------------------------
  // Comparación por tienda
  // ---------------------------------------------------------------------------

  const compareColumnCount = clampCompareColumns(view.compareColumns);

  /**
   * Selección efectiva de tiendas.
   *
   * Sin elección previa se siembra con las tiendas más grandes del catálogo
   * (las facetas ya llegan ordenadas por cantidad). Abrir la vista en blanco y
   * exigir dos decisiones antes de mostrar nada la haría parecer rota; con
   * tiendas puestas se ve la forma de entrada y cambiarlas es un gesto, no un
   * requisito. Se deriva en vez de sembrarse desde un efecto: un efecto que
   * escribe estado en el primer render sólo agrega un render de más.
   */
  const seededCompareStores = useMemo(
    () => compareStores ?? Array.from({ length: MAX_COMPARE_COLUMNS }, (_, i) => stores[i]),
    [compareStores, stores],
  );

  /**
   * Orden dentro de cada columna.
   *
   * "Recién agregados" y "Destacados" no significan nada enfrentados entre
   * tiendas —cada una publica a su ritmo—, así que en esta vista se traducen a
   * precio ascendente, que es la pregunta que la comparación viene a
   * responder. Cualquier otro criterio elegido a mano se respeta tal cual.
   */
  const compareSort: SortOption = sort === "newest" || sort === "relevance" ? "price-asc" : sort;

  /**
   * Filtros comunes a todas las columnas. Va sin `store` a propósito: esa es
   * justamente la variable que cambia de una columna a otra.
   */
  const compareBaseQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
    if (filters.onlyDiscounted) params.set("onlyDiscounted", "1");
    if (filters.onlyInStock) params.set("onlyInStock", "1");
    params.set("sort", compareSort);
    if (locale) params.set("locale", locale);
    return params.toString();
  }, [query, category, filters, compareSort, locale]);

  const visibleCompareStores = useMemo(
    () => seededCompareStores.slice(0, compareColumnCount),
    [seededCompareStores, compareColumnCount],
  );

  const comparisonColumns = useStoreComparison({
    enabled: isComparing,
    stores: visibleCompareStores,
    baseQuery: compareBaseQuery,
    remoteSearch,
    localProducts: initialProducts,
  });

  const activeExtraFilters = countActiveFilters(filters);
  const hasCriteria =
    query.trim() !== "" || store !== undefined || category !== undefined || activeExtraFilters > 0;

  /** Los parámetros que definen una consulta al servidor. */
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (store) params.set("store", store);
    if (category) params.set("category", category);
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
    if (filters.onlyDiscounted) params.set("onlyDiscounted", "1");
    if (filters.onlyInStock) params.set("onlyInStock", "1");
    params.set("sort", sort);
    if (locale) params.set("locale", locale);
    params.set("limit", String(PAGE_SIZE));
    return params.toString();
  }, [query, store, category, filters, sort, locale]);

  // Descarta respuestas de consultas ya superadas: sin esto, una petición lenta
  // puede llegar después de otra más nueva y pisar resultados correctos.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!remoteSearch || !hasCriteria) return;

    const seq = ++requestSeq.current;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/products/search?${queryString}`);
        const payload = await response.json();
        if (seq !== requestSeq.current) return;
        setRemoteProducts(Array.isArray(payload.products) ? payload.products : []);
        setRemoteTotal(typeof payload.total === "number" ? payload.total : null);
        setPage(0);
      } catch {
        if (seq !== requestSeq.current) return;
        setRemoteProducts([]);
        setRemoteTotal(0);
      } finally {
        if (seq === requestSeq.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [remoteSearch, hasCriteria, queryString]);

  /** Trae la página siguiente y la agrega a lo que ya se ve. */
  async function loadMore() {
    if (!remoteSearch || isLoadingMore) return;
    const nextPage = page + 1;
    setIsLoadingMore(true);

    try {
      const params = new URLSearchParams(queryString);
      params.set("offset", String(nextPage * PAGE_SIZE));
      const response = await fetch(`/api/products/search?${params}`);
      const payload = await response.json();
      const incoming: Product[] = Array.isArray(payload.products) ? payload.products : [];

      setRemoteProducts((current) => [...(current ?? initialProducts), ...incoming]);
      if (typeof payload.total === "number") setRemoteTotal(payload.total);
      setPage(nextPage);
    } catch {
      // Un fallo al pedir más no debe borrar lo que ya se está viendo.
    } finally {
      setIsLoadingMore(false);
    }
  }

  const visibleProducts = useMemo(() => {
    // Con resultados del servidor el filtrado ya vino aplicado; solo se ordena
    // en el cliente para que cambiar el orden se sienta instantáneo. Los
    // resultados remotos solo cuentan mientras haya criterios: al limpiar se
    // vuelve al lote inicial sin esperar a ningún efecto.
    if (remoteSearch && hasCriteria && remoteProducts !== null) {
      return sortProducts(remoteProducts, sort);
    }
    return sortProducts(filterProducts(initialProducts, { query, store, category }), sort);
  }, [remoteSearch, hasCriteria, remoteProducts, initialProducts, query, store, category, sort]);

  const shownCount = visibleProducts.length;
  const totalCount =
    remoteSearch && hasCriteria && remoteTotal !== null ? remoteTotal : (totalResults ?? shownCount);
  const canLoadMore = remoteSearch && shownCount < totalCount;

  const hasActiveFilters = store !== undefined || category !== undefined || activeExtraFilters > 0;

  const resultsLabel = totalCount === 1 ? t("resultsCountOne") : t("resultsCountMany");
  const numberFormat = useMemo(() => new Intl.NumberFormat(priceLocale ?? "es-HN"), [priceLocale]);

  function clearFilters() {
    setStore(undefined);
    setCategory(undefined);
    setFilters(EMPTY_FILTER_STATE);
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
        {/* En teléfono la búsqueda ocupa su propia línea —es la acción
            principal y necesita el ancho completo— y los selectores van debajo.
            A partir de lg todo cabe en una línea: con el contenedor ancho, tres
            selectores repartidos a lo largo de 1200px daban píldoras de 400px
            para elegir entre "Todas" y un nombre de tienda. */}
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-3">
          <div className="lg:min-w-0 lg:flex-1">
            <SearchBar onQueryChange={setQuery} />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:flex lg:shrink-0 lg:gap-3">
            <div className="lg:w-[12.5rem]">
              <StoreFilter
                stores={stores}
                counts={storeCounts}
                selectedStore={store}
                onChange={setStore}
              />
            </div>
            <div className="lg:w-[12.5rem]">
              <CategoryFilter
                categories={categories}
                counts={categoryCounts}
                selectedCategory={category}
                onChange={setCategory}
              />
            </div>
            <div className="col-span-2 sm:col-span-1 lg:w-[14.5rem]">
              <SortFilter selectedSort={sort} onChange={setSort} />
            </div>
          </div>
        </div>

        {/* Segunda línea: filtros extra a la izquierda, presentación a la
            derecha. Se separan porque responden a preguntas distintas —qué veo
            contra cómo lo veo— y mezclarlas obliga a releer la barra entera. */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
            className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[0.8125rem] text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {t("moreFiltersLabel")}
            {/* El contador vive en el botón para que plegar el panel nunca
                esconda estado: si una búsqueda devuelve poco, la causa se ve
                sin abrir nada. */}
            {activeExtraFilters > 0 && (
              <span className="rounded-full bg-[var(--accent)] px-1.5 text-[0.6875rem] font-semibold tabular-nums text-[var(--accent-contrast)]">
                {activeExtraFilters}
              </span>
            )}
          </button>

          <CatalogControls
            mode={view.mode}
            density={view.density}
            onModeChange={(mode) => updateView({ mode })}
            onDensityChange={(density) => updateView({ density })}
            labels={{
              viewMode: t("viewModeLabel"),
              density: t("densityLabel"),
              modes: {
                list: t("viewList"),
                grid: t("viewGrid"),
                gallery: t("viewGallery"),
                compare: t("viewCompare"),
              },
              densities: {
                compact: t("densityCompact"),
                cosy: t("densityCosy"),
                roomy: t("densityRoomy"),
              },
            }}
          />
        </div>
      </div>

      {showFilters && (
        <FilterPanel
          state={filters}
          onChange={setFilters}
          brands={brandFacets ?? []}
          priceBounds={priceBounds ?? { min: 0, max: 0 }}
          currencySymbol={locale === "en" ? "HNL" : "L"}
          labels={{
            priceRange: t("priceRangeLabel"),
            minPrice: t("minPriceLabel"),
            maxPrice: t("maxPriceLabel"),
            brand: t("brandFilterLabel"),
            all: t("filterAllOption"),
            onlyDiscounted: t("onlyDiscountedLabel"),
            onlyInStock: t("onlyInStockLabel"),
          }}
        />
      )}

      {isComparing && (
        <CompareBar
          stores={stores}
          columnCount={compareColumnCount}
          onColumnCountChange={(count) => updateView({ compareColumns: count })}
          selection={seededCompareStores}
          onSelectionChange={(index, store) => {
            const next = [...seededCompareStores];
            next[index] = store;
            setCompareStores(next);
          }}
        />
      )}

      {/* Línea de estado: cuántos resultados hay y, sólo cuando hace falta, la
          salida rápida de vuelta al catálogo completo. En comparar no se pinta:
          el total útil es el de cada columna, y va en su cabecera. */}
      <div className="flex min-h-8 items-center justify-between gap-4 px-1">
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-[0.8125rem] tracking-[0.005em] text-[var(--text-tertiary)] tabular-nums"
        >
          {/* El punto pulsa mientras hay una consulta en vuelo: da señal de que
              algo está pasando sin reemplazar por un spinner la cifra que se
              está leyendo. */}
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
          {/* Con paginación se dice cuántos se ven del total: "60 de 858" evita
              creer que el catálogo se acabó al llegar al final de la página. */}
          {isComparing
            ? ""
            : canLoadMore
              ? `${numberFormat.format(shownCount)} ${t("ofLabel")} ${numberFormat.format(totalCount)} ${resultsLabel}`
              : `${numberFormat.format(totalCount)} ${resultsLabel}`}
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

      {isComparing ? (
        <CompareGrid
          columns={comparisonColumns}
          locale={priceLocale}
          productHref={productHref}
          showEmptyState={visibleCompareStores.every((store) => !store)}
        />
      ) : (
        <ProductGrid
          products={visibleProducts}
          locale={priceLocale}
          mode={gridMode}
          density={view.density}
          productHref={productHref}
          emptyMessage={t("noResultsMessage")}
          viewLargerImageLabel={t("viewLargerImageLabel")}
          closeImageLabel={t("closeImageLabel")}
        />
      )}

      {!isComparing && canLoadMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="rounded-full border border-[var(--border-strong)] px-6 py-2.5 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-[background-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:bg-[var(--bg-subtle)] active:scale-[0.98] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            {isLoadingMore ? `${t("loadingLabel")}…` : t("loadMoreLabel")}
          </button>
        </div>
      )}
    </div>
  );
}
