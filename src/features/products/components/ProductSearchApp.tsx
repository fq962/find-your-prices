"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Product } from "@/types";
import type { FacetOption } from "@/features/products/categoryFacets";
import { useLocale } from "@/features/i18n/LocaleContext";
import { filterProducts, getFacets } from "@/features/products/filterProducts";
import { productPath } from "@/features/products/productPath";
import { DEFAULT_SORT, sortProducts, type SortOption } from "@/features/products/sortProducts";
import { useCatalogFeed } from "@/features/products/useCatalogFeed";
import type { Suggestion } from "@/features/products/useSearchSuggestions";
import { categoryPaths } from "@/lib/seo/categorySeo";
import { SearchBar } from "./SearchBar";
import { SortFilter } from "./SortFilter";
import { FilterSidebar } from "./FilterSidebar";
import { FilterSheet } from "./FilterSheet";
import { ProductGrid } from "./ProductGrid";
import { CatalogFeedFooter } from "./CatalogFeedFooter";
import { CompareTrayDock } from "./CompareTrayDock";
import { ProductComparisonDialog } from "./ProductComparisonDialog";
import { useCompareTray } from "@/features/products/useCompareTray";
import type { CompareToggleLabels } from "./CompareToggle";
import type { FavoriteToggleLabels } from "./FavoriteToggle";
import {
  countActiveFilters,
  EMPTY_FILTER_STATE,
  type CatalogFilterState,
} from "@/features/products/catalogFilters";
import {
  RESULTS_ANCHOR,
  saveWidenedNotice,
  takeWidenedNotice,
  type WidenedNotice,
} from "@/features/products/searchScope";
import {
  catalogUrlSearch,
  EMPTY_CATALOG_URL_STATE,
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
  /**
   * Acota TODO a una categoría canónica (slug), sin que se pueda quitar.
   *
   * Es lo que hace que el mismo buscador sirva en una página de categoría:
   * cada consulta lleva `category=<scope>` salvo que la persona marque una
   * subcategoría, que ya está dentro del alcance. Las facetas de categoría
   * que se ofrecen son las hijas, y las cuentas de tienda y marca llegan ya
   * acotadas desde la ruta.
   */
  scopeCategory?: string;
  /**
   * Acota TODO a una tienda (slug de `stores`), sin que se pueda quitar.
   *
   * Es lo que hace que el mismo buscador sirva en una landing de tienda:
   * cada consulta lleva `storeSlug=<scope>` y la faceta de tienda desaparece
   * del panel, porque elegir otra tienda ahí sería salir de la página.
   */
  scopeStore?: string;
  /**
   * Pintar la caja de búsqueda encima de los resultados.
   *
   * La portada la apaga: ahí el buscador vive en la barra de navegación, que
   * escribe en la misma URL que este componente lee. Una página de categoría
   * la deja puesta, porque su buscador está acotado a la categoría y el de la
   * barra no.
   */
  showSearch?: boolean;
  /**
   * Adónde ampliar cuando una búsqueda dentro de `scopeCategory` no encuentra
   * nada: la página sin esa categoría (la tienda sola, o la portada). Sin
   * esto la búsqueda vacía se queda vacía.
   */
  widenHref?: string;
  /** Nombre de `scopeCategory`, para el aviso de que se amplió. */
  scopeCategoryLabel?: string;
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
  scopeCategory,
  scopeStore,
  showSearch = true,
  widenHref,
  scopeCategoryLabel,
}: ProductSearchAppProps) {
  const { t } = useLocale();

  const [showFilters, setShowFilters] = useState(false);

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
   * Categorías que de verdad viajan al servidor. Con alcance fijo y sin
   * selección, el alcance; con selección, solo la selección (las hijas ya
   * están dentro del alcance, y mandar las dos con OR lo anularía).
   */
  const effectiveCategory = useMemo(
    () => (category.length === 0 && scopeCategory ? [scopeCategory] : category),
    [category, scopeCategory],
  );

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
    (value: string[]) => updateCatalog({ store: value }),
    [updateCatalog],
  );
  const setCategory = useCallback(
    (value: string[]) => updateCatalog({ category: value }),
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

  /**
   * Una sugerencia elegida en la caja de esta página. Un artículo ya puso su
   * nombre en la caja; una tienda es un filtro; una categoría es su página.
   *
   * A la categoría se va con una navegación completa y no con el router de
   * Next: este componente también se monta fuera de la app (pruebas), donde
   * no hay router, y una página de categoría se sirve entera de todos modos.
   */
  const onSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.kind === "store") updateCatalog({ query: "", store: [suggestion.name] });
      if (suggestion.kind === "category") {
        window.location.assign(categoryPaths(suggestion.slug)[locale === "en" ? "en" : "es"]);
      }
    },
    [updateCatalog, locale],
  );

  // Sin locale explícito se deja que la ficha use su default: es lo que
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
  // "Cuál de estos cuatro artículos me conviene". Vive en su propio store
  // persistido para que la selección sobreviva a cambiar de filtro y de
  // sesión.
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

  const favoriteToggleLabels: FavoriteToggleLabels = useMemo(
    () => ({ add: t("favoriteAddLabel"), remove: t("favoriteRemoveLabel") }),
    [t],
  );

  // Vaciar la bandeja con el diálogo abierto lo deja sin nada que mostrar: se
  // cierra, que es lo que esperaría cualquiera que acaba de vaciarla.
  function clearTray() {
    tray.clear();
    setIsComparisonOpen(false);
  }

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
    for (const value of store) params.append("store", value);
    if (scopeStore) params.append("storeSlug", scopeStore);
    for (const value of effectiveCategory) params.append("category", value);
    for (const value of filters.brand) params.append("brand", value);
    if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
    if (filters.onlyDiscounted) params.set("onlyDiscounted", "1");
    if (filters.includeUnavailable) params.set("includeUnavailable", "1");
    params.set("sort", sort);
    if (locale) params.set("locale", locale);
    return params.toString();
  }, [query, store, scopeStore, effectiveCategory, filters, sort, locale]);

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
    store.length === 0 &&
    category.length === 0 &&
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

  const hasActiveFilters = store.length > 0 || category.length > 0 || activeExtraFilters > 0;

  // ---------------------------------------------------------------------------
  // Nunca dejar a nadie sin resultados por la categoría
  //
  // Una búsqueda que no encuentra nada en la categoría elegida se amplía a
  // todas: se quita la faceta y, si la categoría es la de la propia página,
  // se va a la página sin ella. Un aviso dice qué pasó, para que no parezca
  // que el filtro se ignoró. Solo con un total ya asentado para ESTA consulta:
  // mientras llega la nueva sigue en pantalla la anterior, y su 0 no dice nada.
  // ---------------------------------------------------------------------------

  const [widened, setWidened] = useState<WidenedNotice | null>(null);

  // El aviso que dejó la página anterior al ampliar hacia esta.
  useEffect(() => {
    const notice = takeWidenedNotice();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage solo existe en el cliente
    if (notice) setWidened(notice);
  }, []);

  const trimmedQuery = query.trim();
  const shouldWiden =
    remoteSearch &&
    trimmedQuery !== "" &&
    feed.isSettled &&
    !feed.isSearching &&
    !feed.hasError &&
    feed.total === 0 &&
    (category.length > 0 || Boolean(scopeCategory && widenHref));

  useEffect(() => {
    if (!shouldWiden) return;
    if (category.length > 0) {
      const names = category.map((slug) => facetLabel(categoryOptions, slug) ?? slug);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- responde a una consulta ya resuelta
      setWidened({ query: trimmedQuery, from: names.join(", ") });
      updateCatalog({ category: [] });
      return;
    }
    if (widenHref) {
      saveWidenedNotice({ query: trimmedQuery, from: scopeCategoryLabel ?? scopeCategory ?? "" });
      const search = catalogUrlSearch({ ...EMPTY_CATALOG_URL_STATE, query: trimmedQuery });
      // Navegación completa y no el router, por lo mismo que en
      // `onSelectSuggestion`: este componente también se monta sin router.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`${widenHref}${search}#${RESULTS_ANCHOR}`);
    }
  }, [shouldWiden, category, categoryOptions, trimmedQuery, updateCatalog, widenHref, scopeCategory, scopeCategoryLabel]);

  const showWidened = widened !== null && widened.query === trimmedQuery && category.length === 0;

  const resultsLabel = totalCount === 1 ? t("resultsCountOne") : t("resultsCountMany");
  const numberFormat = useMemo(() => new Intl.NumberFormat(priceLocale ?? "es-HN"), [priceLocale]);

  /**
   * Limpiar es un solo gesto y tiene que ser una sola escritura: tres llamadas
   * seguidas dejarían tres direcciones intermedias en la barra —una con tienda
   * puesta, otra sin ella— y cada una dispararía su propia consulta.
   */
  function clearFilters() {
    updateCatalog({ store: [], category: [], filters: EMPTY_FILTER_STATE });
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
    activeExtraFilters + (store.length > 0 ? 1 : 0) + (category.length > 0 ? 1 : 0);

  /**
   * Las props del panel de facetas, compartidas por los dos sitios donde
   * aparece: la barra lateral de escritorio y la hoja de teléfono. Sólo uno de
   * los dos está en pantalla a la vez —la hoja es `lg:hidden` y el aside es
   * `hidden lg:block`—, así que no hay casillas con el mismo `name` compitiendo.
   *
   * Cada sitio monta su propia instancia (`sidebar` / `mobileSidebar`) en
   * lugar de reutilizar un mismo elemento porque cada una necesita su propio
   * estado de qué secciones arrancan abiertas: en escritorio tienda y precio,
   * en teléfono todo cerrado —la hoja ya ocupa toda la pantalla, y abrir las
   * cuatro secciones de una vez sólo cambia cuánto hay que desplazar antes de
   * ver el botón de aplicar.
   */
  const sidebarProps = {
    categories: categoryOptions,
    stores: storeOptions,
    brands: brandFacets ?? [],
    category,
    store,
    brand: filters.brand,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    onlyDiscounted: filters.onlyDiscounted,
    includeUnavailable: filters.includeUnavailable,
    onCategoryChange: setCategory,
    onStoreChange: setStore,
    onBrandChange: (brand: string[]) => patchFilters({ brand }),
    onPriceChange: (range: { min?: number; max?: number }) =>
      patchFilters({ minPrice: range.min, maxPrice: range.max }),
    onOnlyDiscountedChange: (onlyDiscounted: boolean) => patchFilters({ onlyDiscounted }),
    onIncludeUnavailableChange: (includeUnavailable: boolean) =>
      patchFilters({ includeUnavailable }),
    currencySymbol: locale === "en" ? "HNL" : "L",
    formatAmount: (amount: number) => numberFormat.format(amount),
    labels: {
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
      uncategorized: t("filterUncategorizedLabel"),
      expand: t("filterExpandLabel"),
      collapse: t("filterCollapseLabel"),
    },
  };

  const sidebar = <FilterSidebar {...sidebarProps} hideStore={Boolean(scopeStore)} />;
  const mobileSidebar = (
    <FilterSidebar {...sidebarProps} hideStore={Boolean(scopeStore)} initiallyOpen={[]} />
  );

  return (
    <div id={RESULTS_ANCHOR} className="flex scroll-mt-20 flex-col gap-5">
      {/* La caja de búsqueda de la página, sólo donde la barra de navegación
          no la cubre (ver `showSearch`). */}
      {showSearch && (
        <div className="py-1">
          <SearchBar
            value={query}
            onQueryChange={setQuery}
            suggest={remoteSearch}
            onSelectSuggestion={onSelectSuggestion}
          />
        </div>
      )}

      {/* Dos columnas a partir de lg: facetas fijas a la izquierda, resultados
          a la derecha. Por debajo de ese ancho la columna de filtros no cabe
          sin robarle al catálogo la mitad de la pantalla, así que se convierte
          en la hoja a pantalla completa, y el botón que la abre va a la
          derecha de la línea de estado. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[16.5rem_minmax(0,1fr)]">
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

        <div className="flex min-w-0 flex-col gap-5">
          {/* Línea de estado: cuántos resultados hay y, a la derecha, cómo se
              ordenan (escritorio) o el botón de filtros (teléfono y tableta).

              En teléfono se pega bajo la barra de navegación: el botón de
              filtros es la única puerta a las facetas y al orden, y perderlo
              de vista a la tercera pantalla de fichas obligaba a volver
              arriba para cambiar de idea. */}
          <div className="sticky top-14 z-30 -mx-4 flex min-h-12 items-center justify-between gap-3 bg-[var(--glass)] px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:min-h-8 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <p
              aria-live="polite"
              className="flex min-w-0 items-center gap-2 text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--text)] tabular-nums"
            >
              {/* El punto pulsa mientras hay una consulta en vuelo: da señal de
                  que algo está pasando sin reemplazar por un spinner la cifra
                  que se está leyendo. */}
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-opacity duration-[var(--dur-base)] ${
                  isSearching ? "bg-[var(--accent)] opacity-100" : "opacity-0"
                }`}
                style={
                  isSearching
                    ? { animation: "fyp-pulse 1.1s var(--ease-in-out-expo) infinite" }
                    : undefined
                }
              />
              {/* Con la lista creciendo sola, esta cifra es lo único que dice
                  dónde estás: "96 de 29 753" mientras queden por traer, y el
                  total a secas cuando ya no. */}
              <span className="truncate">
                {feed.hasMore
                  ? `${numberFormat.format(shownCount)} ${t("ofLabel")} ${numberFormat.format(totalCount)} ${resultsLabel}`
                  : `${numberFormat.format(totalCount)} ${resultsLabel}`}
              </span>
            </p>

            <div className="flex shrink-0 items-center gap-2">
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

              {/* Teléfono y tableta: acá la barra lateral no existe y este
                  botón es la única puerta a las facetas y al orden. El
                  contador es lo que impide que la hoja cerrada esconda
                  estado. */}
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="flex h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:hidden"
              >
                {t("filtersLabel")}
                {activeSidebarFilters > 0 && (
                  <span className="rounded-full bg-[var(--accent)] px-1.5 text-[0.6875rem] font-semibold tabular-nums text-[var(--accent-contrast)]">
                    {activeSidebarFilters}
                  </span>
                )}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-[var(--text-secondary)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {/* Escritorio: el orden a la vista, a la derecha. En teléfono
                  vive dentro de la hoja de filtros. */}
              <div className="hidden w-[13rem] lg:block">
                <SortFilter selectedSort={sort} onChange={setSort} />
              </div>
            </div>
          </div>

          {showWidened && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-4 py-3 text-[0.9375rem] leading-[1.45] text-[var(--text)]"
              style={{ animation: "fyp-fade 260ms var(--ease-out-quart) both" }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 11v5M12 7.8v.2" />
              </svg>
              <p className="min-w-0 flex-1">
                {t("searchWidenedNotice")
                  .replace("{query}", widened.query)
                  .replace("{scope}", widened.from)}
              </p>
              <button
                type="button"
                aria-label={t("searchWidenedDismiss")}
                onClick={() => setWidened(null)}
                className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                >
                  <path d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <ProductGrid
            products={visibleProducts}
            locale={priceLocale}
            productHref={productHref}
            label={t("resultsListLabel")}
            /* Una búsqueda que falló no es una búsqueda sin resultados: decir
               "no hay productos" cuando lo que pasó es que se cayó la red manda a
               la gente a cambiar los filtros para arreglar algo que no está roto
               ahí. El pie de la lista ofrece el reintento. */
            emptyMessage={
              feed.hasError && shownCount === 0 ? t("searchErrorLabel") : t("noResultsMessage")
            }
            compareLabels={compareToggleLabels}
            favoriteLabels={favoriteToggleLabels}
          />

          {remoteSearch && (
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

      {/* Las mismas facetas, en teléfono, con el orden arriba del todo: es lo
          que más se cambia y lo único que en escritorio queda fuera del
          panel. El componente de facetas es uno solo: escribir dos paneles
          era garantizar que una faceta nueva entrara en uno y no en el otro. */}
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
        <div className="border-b border-[var(--border)] py-4">
          <p className="mb-2 text-[0.9375rem] font-medium text-[var(--text)]">{t("sortLabel")}</p>
          <SortFilter selectedSort={sort} onChange={setSort} />
        </div>
        {mobileSidebar}
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

/** Nombre de una categoría entre las opciones del panel (raíces e hijas). */
function facetLabel(options: FacetOption[], slug: string): string | null {
  for (const option of options) {
    if (option.value === slug) return option.label ?? option.value;
    const child = option.children ? facetLabel(option.children, slug) : null;
    if (child) return child;
  }
  return null;
}
