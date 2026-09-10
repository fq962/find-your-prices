"use client";

import {
  useCallback,
  useMemo,
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
import { useCatalogFeed } from "@/features/products/useCatalogFeed";
import { SearchBar } from "./SearchBar";
import { SortFilter } from "./SortFilter";
import { FilterSidebar } from "./FilterSidebar";
import { FilterSheet } from "./FilterSheet";
import { ProductGrid } from "./ProductGrid";
import { CatalogControls } from "./CatalogControls";
import { CatalogFeedFooter } from "./CatalogFeedFooter";
import { CompareBar } from "./CompareBar";
import { CompareGrid } from "./CompareGrid";
import { CompareTrayDock } from "./CompareTrayDock";
import { ProductComparisonDialog } from "./ProductComparisonDialog";
import { useCompareTray } from "@/features/products/useCompareTray";
import type { CompareToggleLabels } from "./CompareToggle";
import {
  countActiveFilters,
  EMPTY_FILTER_STATE,
  type CatalogFilterState,
} from "@/features/products/catalogFilters";
import {
  getCatalogUrlServerSnapshot,
  getCatalogUrlSnapshot,
  subscribeToCatalogUrl,
  writeCatalogUrl,
  type CatalogUrlState,
} from "@/features/products/catalogUrlState";

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
  /** Total de artículos que cumplen los filtros, contado en la base. */
  totalResults?: number;
  /**
   * Resuelve búsqueda y filtros en el servidor sobre el catálogo completo. Con
   * el fixture queda apagado y todo se filtra en memoria, igual que antes.
   */
  remoteSearch?: boolean;
  locale?: string;
}

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
  totalResults,
  remoteSearch = false,
  locale,
}: ProductSearchAppProps) {
  const { t } = useLocale();

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

  // ---------------------------------------------------------------------------
  // La búsqueda, las facetas y el orden viven en la URL
  //
  // Antes vivían en `useState`, y eso hacía que "iphone ordenado por menor
  // precio" y la portada fueran la misma dirección. Tres cosas se rompían con
  // eso, y ninguna es cosmética: el enlace de una búsqueda no se puede
  // compartir, el marcador no guarda nada, y recargar borra lo que se llevaba
  // puesto.
  //
  // La dirección es ahora la única copia de ese estado. Tenerlo en dos sitios
  // —React y la URL, sincronizados a mano— era la forma segura de que acabaran
  // diciendo cosas distintas.
  // ---------------------------------------------------------------------------

  const catalogUrl = useSyncExternalStore(
    subscribeToCatalogUrl,
    getCatalogUrlSnapshot,
    getCatalogUrlServerSnapshot,
  );

  const { query, store, category, sort, filters } = catalogUrl;

  /**
   * Cambia parte del estado del catálogo.
   *
   * Lee el estado vigente del propio store en vez de cerrarse sobre
   * `catalogUrl`, y por eso puede ser estable: sin dependencias, la función no
   * cambia entre renders y los componentes que la reciben —la caja de búsqueda,
   * entre otros— no se vuelven a montar en cada tecla.
   */
  const updateCatalog = useCallback((patch: Partial<CatalogUrlState>) => {
    writeCatalogUrl({ ...getCatalogUrlSnapshot(), ...patch });
  }, []);

  const setQuery = useCallback(
    (value: string) => updateCatalog({ query: value }),
    [updateCatalog],
  );
  const setStore = useCallback(
    (value: string | undefined) => updateCatalog({ store: value }),
    [updateCatalog],
  );
  const setCategory = useCallback(
    (value: string | undefined) => updateCatalog({ category: value }),
    [updateCatalog],
  );
  const setSort = useCallback(
    (value: SortOption) => updateCatalog({ sort: value }),
    [updateCatalog],
  );

  /** Un cambio parcial de los filtros del panel, sobre los que ya hubiera. */
  const patchFilters = useCallback(
    (patch: Partial<CatalogFilterState>) =>
      updateCatalog({ filters: { ...getCatalogUrlSnapshot().filters, ...patch } }),
    [updateCatalog],
  );

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
  // hay ficha que enlazar —esos artículos no existen en la base y no traen
  // slug—, así que se deja sin enlace y el nombre sigue llevando a la tienda.
  const productHref = useMemo(
    () =>
      remoteSearch && locale
        ? (product: Product) =>
            product.slug
              ? productPath(locale === "en" ? "en" : "es", product.slug)
              : undefined
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

  /**
   * Opciones para la barra lateral, con su conteo.
   *
   * Con catálogo real llegan del servidor ya contadas. Con el fixture no hay
   * conteos, así que se derivan de los propios artículos: es lo que mantiene
   * las pruebas y el desarrollo sin base funcionando igual que producción.
   */
  const storeOptions = useMemo(
    () => storeFacets ?? stores.map((value) => ({ value, count: 0 })),
    [storeFacets, stores],
  );
  const categoryOptions = useMemo(
    () => categoryFacets ?? categories.map((value) => ({ value, count: 0 })),
    [categoryFacets, categories],
  );

  // ---------------------------------------------------------------------------
  // Bandeja de comparación de productos
  //
  // Es la otra comparación: no "qué tiene cada tienda" sino "cuál de estos
  // cuatro artículos me conviene". Vive en su propio store persistido para que
  // la selección sobreviva a cambiar de filtro, de vista y de sesión.
  // ---------------------------------------------------------------------------

  const tray = useCompareTray();
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  const compareToggleLabels: CompareToggleLabels = useMemo(
    () => ({
      add: t("compareAddLabel"),
      remove: t("compareRemoveLabel"),
      full: t("compareFullLabel"),
    }),
    [t],
  );

  // Vaciar la bandeja con el diálogo abierto lo deja sin nada que mostrar: se
  // cierra, que es lo que esperaría cualquiera que acaba de vaciarla.
  function clearTray() {
    tray.clear();
    setIsComparisonOpen(false);
  }

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
    if (filters.includeUnavailable) params.set("includeUnavailable", "1");
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

  // ---------------------------------------------------------------------------
  // El listado
  // ---------------------------------------------------------------------------

  /**
   * Los parámetros que definen una consulta al servidor. Sin `limit` ni
   * `offset`: esos los pone la paginación, y meterlos acá haría que la clave de
   * la consulta cambiara al pedir la página siguiente.
   */
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (store) params.set("store", store);
    if (category) params.set("category", category);
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
    if (filters.onlyDiscounted) params.set("onlyDiscounted", "1");
    if (filters.includeUnavailable) params.set("includeUnavailable", "1");
    params.set("sort", sort);
    if (locale) params.set("locale", locale);
    return params.toString();
  }, [query, store, category, filters, sort, locale]);

  /**
   * Si esta consulta es la que el servidor ya resolvió al pintar la página.
   *
   * El orden cuenta como criterio, y esa es una corrección respecto de antes:
   * elegir "Menor precio" sin ningún filtro reordenaba en el navegador los
   * artículos ya cargados y mostraba el más barato DE ESE LOTE, con el rótulo
   * "48 de 29 753 resultados" al lado. Ahora ordenar es una consulta nueva
   * sobre el catálogo entero, que es lo que la etiqueta dice.
   */
  const isDefaultQuery =
    query.trim() === "" &&
    store === undefined &&
    category === undefined &&
    activeExtraFilters === 0 &&
    sort === DEFAULT_SORT;

  const feed = useCatalogFeed({
    enabled: remoteSearch,
    queryString,
    isDefaultQuery,
    initialProducts,
    initialTotal: totalResults ?? initialProducts.length,
  });

  const visibleProducts = useMemo(() => {
    // Con catálogo real el servidor ya filtró Y ordenó sobre los miles de
    // artículos: reordenar acá sólo reordenaría la parte cargada, que es
    // justamente la mentira que se quería evitar. Sin API sí se filtra y ordena
    // en memoria, que es todo lo que hay (fixture y pruebas).
    if (remoteSearch) return feed.products;
    return sortProducts(filterProducts(initialProducts, { query, store, category }), sort);
  }, [remoteSearch, feed.products, initialProducts, query, store, category, sort]);

  const shownCount = visibleProducts.length;
  const totalCount = remoteSearch ? feed.total : shownCount;
  const isSearching = feed.isSearching;

  const hasActiveFilters = store !== undefined || category !== undefined || activeExtraFilters > 0;

  const resultsLabel = totalCount === 1 ? t("resultsCountOne") : t("resultsCountMany");
  const numberFormat = useMemo(() => new Intl.NumberFormat(priceLocale ?? "es-HN"), [priceLocale]);

  /**
   * Limpiar es un solo gesto y tiene que ser una sola escritura: tres llamadas
   * seguidas dejarían tres direcciones intermedias en la barra —una con tienda
   * puesta, otra sin ella— y cada una dispararía su propia consulta.
   */
  function clearFilters() {
    updateCatalog({ store: undefined, category: undefined, filters: EMPTY_FILTER_STATE });
  }

  /**
   * Cuántas facetas hay puestas, contando también tienda y categoría.
   *
   * Es distinto de `activeExtraFilters`: aquel contaba sólo los filtros del
   * panel plegado, porque tienda y categoría vivían a la vista en la barra
   * superior. Ahora las cuatro están dentro del mismo panel, así que el
   * contador del botón tiene que contarlas todas o mentiría en teléfono —donde
   * ese número es lo único que dice que hay filtros puestos.
   */
  const activeSidebarFilters =
    activeExtraFilters + (store ? 1 : 0) + (category ? 1 : 0);

  /**
   * El panel de facetas, montado una sola vez y colocado en dos sitios: la
   * barra lateral de escritorio y la hoja de teléfono. Sólo uno de los dos está
   * en pantalla a la vez —la hoja es `lg:hidden` y el aside es `hidden lg:block`—,
   * así que no hay estado duplicado ni radios con el mismo `name` compitiendo.
   */
  const sidebar = (
    <FilterSidebar
      categories={categoryOptions}
      stores={storeOptions}
      brands={brandFacets ?? []}
      category={category}
      store={store}
      brand={filters.brand}
      minPrice={filters.minPrice}
      maxPrice={filters.maxPrice}
      onlyDiscounted={filters.onlyDiscounted}
      includeUnavailable={filters.includeUnavailable}
      onCategoryChange={setCategory}
      onStoreChange={setStore}
      onBrandChange={(brand) => patchFilters({ brand })}
      onPriceChange={(range) => patchFilters({ minPrice: range.min, maxPrice: range.max })}
      onOnlyDiscountedChange={(onlyDiscounted) => patchFilters({ onlyDiscounted })}
      onIncludeUnavailableChange={(includeUnavailable) => patchFilters({ includeUnavailable })}
      currencySymbol={locale === "en" ? "HNL" : "L"}
      formatAmount={(amount) => numberFormat.format(amount)}
      labels={{
        category: t("categoryFilterLabel"),
        price: t("priceRangeLabel"),
        store: t("storeFilterLabel"),
        brand: t("brandFilterLabel"),
        more: t("moreFiltersLabel"),
        all: t("filterAllOption"),
        search: t("filterSearchLabel"),
        noMatches: t("filterNoMatchesLabel"),
        anyPrice: t("anyPriceLabel"),
        andUp: t("andUpLabel"),
        minPrice: t("minPriceLabel"),
        maxPrice: t("maxPriceLabel"),
        onlyDiscounted: t("onlyDiscountedLabel"),
        includeUnavailable: t("includeUnavailableLabel"),
        showMore: t("filterShowMoreLabel"),
        showLess: t("filterShowLessLabel"),
      }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* La búsqueda se pega bajo la navegación, sola y a todo el ancho. Es la
          acción principal del sitio y ya no comparte línea con los selectores:
          esos se fueron a la barra lateral, que es donde se pueden ver todos a
          la vez en lugar de tres píldoras que esconden su contenido. */}
      <div
        className="enter sticky top-14 z-30 -mx-4 bg-[var(--glass)] px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:border-[var(--border)] sm:px-3"
        style={{ "--enter-delay": "560ms" } as CSSProperties}
      >
        <SearchBar value={query} onQueryChange={setQuery} />
      </div>

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

      {/* Dos columnas a partir de lg: facetas fijas a la izquierda, resultados
          a la derecha. Por debajo de ese ancho la columna de filtros no cabe
          sin robarle al catálogo la mitad de la pantalla, así que se convierte
          en la hoja a pantalla completa.

          Comparar es la excepción y ocupa todo el ancho: cuatro columnas de
          producto dentro de dos tercios de pantalla dejan el nombre del
          artículo en tres palabras, y comparar deja de ser leer. */}
      <div
        className={
          isComparing
            ? "flex flex-col gap-4"
            : "flex flex-col gap-4 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[16.5rem_minmax(0,1fr)]"
        }
      >
        {!isComparing && (
          <aside className="hidden lg:block">
            {/* El panel crece hasta donde le haga falta y se desplaza con la
                página, sin caja propia.

                Antes tenía alto máximo y `overflow-y-auto`, y eso creaba tres
                superficies de desplazamiento anidadas —la página, el panel y
                cada lista de facetas—. La rueda actuaba sobre una o sobre otra
                según dónde estuviera el puntero, y las secciones de abajo
                quedaban escondidas detrás de una barra de cuatro píxeles. Se
                pierde que los filtros queden fijos al desplazar; a cambio, todo
                lo que hay se ve, que es la condición previa a poder usarlo.

                `lg:items-start` en la retícula es lo que evita que la columna
                se estire al alto de los resultados. */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 pb-2">
              <h2 className="pt-4 pb-1 text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">
                {t("filterByLabel")}
              </h2>
              {sidebar}
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-col gap-4">
      {/* Línea de estado: cuántos resultados hay, cómo se ordenan y cómo se
          ven. En comparar el recuento no se pinta: el total útil es el de cada
          columna, y va en su cabecera. */}
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
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
              isSearching ? "bg-[var(--accent)] opacity-100" : "opacity-0"
            }`}
            style={
              isSearching
                ? { animation: "fyp-pulse 1.1s var(--ease-in-out-expo) infinite" }
                : undefined
            }
          />
          {/* Con la lista creciendo sola, esta cifra es lo único que dice dónde
              estás: "96 de 29 753" mientras queden por traer, y el total a secas
              cuando ya no. */}
          {isComparing
            ? ""
            : feed.hasMore
              ? `${numberFormat.format(shownCount)} ${t("ofLabel")} ${numberFormat.format(totalCount)} ${resultsLabel}`
              : `${numberFormat.format(totalCount)} ${resultsLabel}`}
        </p>

        {/* En teléfono ocupa su propia línea y el selector de orden se estira
            con lo que sobre. Con `shrink-0` y ancho fijo, los tres controles
            sumaban 431px dentro de una pantalla de 375 y la página entera se
            desplazaba en horizontal. */}
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="group hidden shrink-0 items-center gap-1.5 rounded-full text-[0.8125rem] font-medium text-[var(--accent)] transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:opacity-70 lg:flex"
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

          {/* Sólo en teléfono: acá abajo la barra lateral no existe y este
              botón es la única puerta a las facetas. El contador es lo que
              impide que la hoja cerrada esconda estado. */}
          {!isComparing && (
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:hidden"
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
              {t("filtersLabel")}
              {activeSidebarFilters > 0 && (
                <span className="rounded-full bg-[var(--accent)] px-1.5 text-[0.6875rem] font-semibold tabular-nums text-[var(--accent-contrast)]">
                  {activeSidebarFilters}
                </span>
              )}
            </button>
          )}

          <div className="min-w-0 flex-1 sm:w-[13rem] sm:flex-none">
            <SortFilter selectedSort={sort} onChange={setSort} />
          </div>

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

      {isComparing ? (
        <CompareGrid
          columns={comparisonColumns}
          locale={priceLocale}
          productHref={productHref}
          showEmptyState={visibleCompareStores.every((store) => !store)}
          compareLabels={compareToggleLabels}
        />
      ) : (
        <ProductGrid
          products={visibleProducts}
          locale={priceLocale}
          mode={gridMode}
          density={view.density}
          productHref={productHref}
          label={t("resultsListLabel")}
          /* Una búsqueda que falló no es una búsqueda sin resultados: decir
             "no hay productos" cuando lo que pasó es que se cayó la red manda a
             la gente a cambiar los filtros para arreglar algo que no está roto
             ahí. El pie de la lista ofrece el reintento. */
          emptyMessage={
            feed.hasError && shownCount === 0 ? t("searchErrorLabel") : t("noResultsMessage")
          }
          viewLargerImageLabel={t("viewLargerImageLabel")}
          closeImageLabel={t("closeImageLabel")}
          compareLabels={compareToggleLabels}
        />
      )}

      {!isComparing && remoteSearch && (
        <CatalogFeedFooter
          sentinelRef={feed.sentinelRef}
          hasMore={feed.hasMore}
          isAutoPaused={feed.isAutoPaused}
          isLoadingMore={feed.isLoadingMore}
          hasError={feed.hasError}
          hasProducts={shownCount > 0}
          onLoadMore={feed.loadMore}
          labels={{
            loadingMore: t("loadingMoreLabel"),
            loadMore: t("loadMoreLabel"),
            error: t("feedErrorLabel"),
            retry: t("retryLabel"),
            allShown: t("allResultsShownLabel"),
          }}
        />
      )}
        </div>
      </div>

      {/* Las mismas facetas, en teléfono. El componente es uno solo: escribir
          dos paneles era garantizar que una faceta nueva entrara en uno y no
          en el otro. */}
      <FilterSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
        resultCountLabel={numberFormat.format(totalCount)}
        labels={{
          title: t("filterByLabel"),
          close: t("closeImageLabel"),
          clear: t("clearFiltersLabel"),
          seeResults: t("seeResultsLabel"),
        }}
      >
        {sidebar}
      </FilterSheet>

      {/* La barra tapa el final de la lista mientras hay algo apartado. Este
          espacio de reserva evita que el último producto quede debajo de ella y
          haya que adivinar que existe.

          Toma el alto real que la barra publica en lugar de repetir un número
          a mano: eran dos constantes distintas (6rem acá, 5.25rem allá) para
          una sola medida, y ninguna de las dos coincidía con lo que la barra
          mide de verdad en teléfono. El respaldo cubre el primer pintado,
          antes de que la barra alcance a medirse. */}
      {tray.count > 0 && (
        <div aria-hidden="true" style={{ height: "var(--fyp-dock, 5.5rem)" }} />
      )}

      <CompareTrayDock
        items={tray.items}
        labels={{
          title: t("compareTrayTitle"),
          hint: t("compareTrayHint"),
          open: t("compareOpenLabel"),
          clear: t("compareClearLabel"),
          remove: t("compareRemoveLabel"),
        }}
        onOpen={() => setIsComparisonOpen(true)}
        onRemove={tray.remove}
        onClear={clearTray}
      />

      {isComparisonOpen && (
        <ProductComparisonDialog
          products={tray.items}
          locale={priceLocale}
          productHref={productHref}
          onClose={() => setIsComparisonOpen(false)}
          onRemove={tray.remove}
          onClear={clearTray}
          labels={{
            title: t("compareTableTitle"),
            close: t("closeImageLabel"),
            remove: t("compareRemoveLabel"),
            clear: t("compareClearLabel"),
            price: t("compareAttrPrice"),
            listPrice: t("compareAttrListPrice"),
            discount: t("compareAttrDiscount"),
            store: t("compareAttrStore"),
            brand: t("compareAttrBrand"),
            category: t("compareAttrCategory"),
            availability: t("compareAttrAvailability"),
            rating: t("compareAttrRating"),
            bestPrice: t("compareBestPriceLabel"),
            viewDetail: t("viewDetailLabel"),
            empty: t("compareTableEmpty"),
          }}
        />
      )}
    </div>
  );
}
