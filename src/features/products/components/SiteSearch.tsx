"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import { categoryPaths } from "@/lib/seo/categorySeo";
import { storeCategoryPaths } from "@/lib/seo/storeSeo";
import {
  catalogUrlSearch,
  EMPTY_CATALOG_URL_STATE,
  getCatalogUrlServerSnapshot,
  getCatalogUrlSnapshot,
  subscribeToCatalogUrl,
  writeCatalogUrl,
} from "@/features/products/catalogUrlState";
import {
  inPlaceState,
  isInPlace,
  pageSelection,
  parseSearchPage,
  parseSelectionKey,
  RESULTS_ANCHOR,
  searchHref,
  selectionKey,
  type SearchSelection,
} from "@/features/products/searchScope";
import type { Suggestion } from "@/features/products/useSearchSuggestions";
import { useSearchScope, type ScopeCategory } from "@/features/products/useSearchScope";
import { SearchBar } from "./SearchBar";

/** Suscripción vacía: fuera de las páginas con catálogo no hay URL que seguir. */
function subscribeToNothing(): () => void {
  return () => {};
}

/** "celulares-y-tablets" → "Celulares y tablets": etiqueta mientras llega el árbol. */
function labelFromSlug(slug: string): string {
  const text = slug.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function scrollToResults(): void {
  document.getElementById(RESULTS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * El buscador de la barra de navegación, en todas las páginas, con un
 * selector de alcance a la izquierda como el de departamentos de Amazon.
 *
 * El selector ofrece las categorías raíz del catálogo y, en una landing de
 * tienda, además "Todo en <tienda>" y las categorías que esa tienda vende.
 * Arranca en el alcance de la página: en PriceSmart busca en PriceSmart; en
 * "Abarrotes en PriceSmart", en esa combinación. La lógica de qué significa
 * cada opción vive en `searchScope.ts`.
 *
 * Buscar tiene dos caminos, y se resuelven distinto a propósito:
 *
 *   - Si el alcance elegido es el de la página, se busca ahí mismo: se
 *     escribe la URL (`writeCatalogUrl`) y el `ProductSearchApp` de la página,
 *     que la lee, reacciona. En la portada eso pasa mientras se escribe; en
 *     una landing, al pulsar Enter y bajando hasta los resultados, que ahí
 *     quedan lejos de la barra.
 *   - Si no, se navega a la página que representa ese alcance, con la
 *     búsqueda puesta y el ancla de los resultados.
 */
export function SiteSearch() {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const page = useMemo(() => parseSearchPage(pathname, locale), [pathname, locale]);
  const hasCatalog = page.kind !== "other";

  // Solo se escucha la URL donde hay un catálogo que la lee. Suscribirse
  // anota la dirección como "último catálogo visitado" (ver
  // `subscribeToCatalogUrl`), y hacerlo desde una ficha de producto haría que
  // "Volver al catálogo" llevara a la propia ficha.
  const catalogUrl = useSyncExternalStore(
    hasCatalog ? subscribeToCatalogUrl : subscribeToNothing,
    hasCatalog ? getCatalogUrlSnapshot : getCatalogUrlServerSnapshot,
    getCatalogUrlServerSnapshot,
  );

  const pageStore = page.kind === "store" ? page.store : null;
  const scope = useSearchScope(pageStore, locale);

  // ---------------------------------------------------------------------------
  // La opción elegida
  //
  // Por defecto es la que la página representa, derivada de la ruta y de la
  // URL: así el selector y la faceta de categoría del panel no se
  // contradicen. Solo si se elige un alcance que la página no puede mostrar
  // se guarda aparte, pegado a la ruta, hasta que se busque o se navegue.
  // ---------------------------------------------------------------------------

  const [override, setOverride] = useState<{ path: string; key: string } | null>(null);
  const fromPage = pageSelection(page, catalogUrl);
  const selection: SearchSelection =
    override && override.path === pathname ? parseSelectionKey(override.key) : fromPage;
  const inPlace = isInPlace(page, selection);

  const onScopeChange = useCallback(
    (key: string) => {
      const next = parseSelectionKey(key);
      if (!isInPlace(page, next)) {
        setOverride({ path: pathname, key });
        return;
      }
      setOverride(null);
      const current = getCatalogUrlSnapshot();
      writeCatalogUrl(inPlaceState(page, next, current, current.query));
    },
    [page, pathname],
  );

  const go = useCallback(
    (query: string) => {
      setOverride(null);
      router.push(searchHref(selection, query, locale));
    },
    [router, selection, locale],
  );

  // En la portada se filtra mientras se escribe, como siempre. En una landing
  // los resultados están al fondo: se espera al Enter para no buscar a ciegas.
  const onQueryChange = useCallback(
    (query: string) => {
      if (page.kind === "home" && inPlace) writeCatalogUrl({ ...getCatalogUrlSnapshot(), query });
    },
    [page.kind, inPlace],
  );

  const onSubmit = useCallback(
    (query: string) => {
      if (!inPlace) {
        go(query);
        return;
      }
      if (page.kind === "home") return;
      writeCatalogUrl({ ...getCatalogUrlSnapshot(), query });
      scrollToResults();
    },
    [inPlace, page.kind, go],
  );

  const onSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.kind === "category") {
        // Con una tienda elegida, la categoría dentro de esa tienda si la
        // vende; si no, su página del catálogo entero.
        const storeSells =
          selection.store !== null &&
          scope.store?.categories.some(
            (root) =>
              root.slug === suggestion.slug ||
              root.children.some((child) => child.slug === suggestion.slug),
          );
        router.push(
          storeSells && selection.store
            ? storeCategoryPaths(selection.store, suggestion.slug)[locale]
            : categoryPaths(suggestion.slug)[locale],
        );
        return;
      }
      if (suggestion.kind === "store") {
        // Elegir una tienda es "mostrame esta tienda": se borra lo escrito,
        // que era el nombre de la tienda a medias y no un artículo.
        if (page.kind === "home") {
          writeCatalogUrl({ ...getCatalogUrlSnapshot(), query: "", store: [suggestion.name] });
        } else {
          const search = catalogUrlSearch({ ...EMPTY_CATALOG_URL_STATE, store: [suggestion.name] });
          router.push(`${routeFor("home", locale)}${search}`);
        }
        return;
      }
      // Un artículo: la caja ya puso su nombre y avisó; se busca como con Enter.
      onSubmit(suggestion.name);
    },
    [selection.store, scope.store, router, locale, page.kind, onSubmit],
  );

  return (
    <SearchBar
      size="sm"
      value={hasCatalog ? catalogUrl.query : ""}
      suggest
      onQueryChange={onQueryChange}
      onSubmit={onSubmit}
      onSelectSuggestion={onSelectSuggestion}
      leading={
        <ScopeSelect
          value={selectionKey(selection)}
          selection={selection}
          pageStore={pageStore}
          storeName={scope.store?.store?.name ?? null}
          storeCategories={scope.store?.categories ?? []}
          globalCategories={scope.global}
          onChange={onScopeChange}
          labels={{
            scope: t("searchScopeLabel"),
            all: t("filterAllOption"),
            allCategories: t("searchScopeAllCategories"),
            allStores: t("searchScopeAllStores"),
            wholeStore: t("searchScopeWholeStore"),
          }}
        />
      }
    />
  );
}

// -----------------------------------------------------------------------------
// El selector
// -----------------------------------------------------------------------------

interface ScopeSelectProps {
  value: string;
  selection: SearchSelection;
  pageStore: string | null;
  storeName: string | null;
  storeCategories: ScopeCategory[];
  globalCategories: ScopeCategory[];
  onChange: (key: string) => void;
  labels: { scope: string; all: string; allCategories: string; allStores: string; wholeStore: string };
}

interface ScopeOption {
  key: string;
  label: string;
}

/** Busca el nombre de un slug entre raíces e hijas. */
function findName(categories: ScopeCategory[], slug: string): string | null {
  for (const root of categories) {
    if (root.slug === slug) return root.name;
    const child = root.children.find((node) => node.slug === slug);
    if (child) return child.name;
  }
  return null;
}

/**
 * Las opciones de un grupo: "todo" y las raíces. Si la elegida es una hija
 * (se está en su landing) o todavía no llegó el árbol, se agrega para que
 * el `<select>` no caiga a la primera opción sin avisar.
 */
function groupOptions(
  store: string | null,
  allLabel: string,
  categories: ScopeCategory[],
  selection: SearchSelection,
): ScopeOption[] {
  const options: ScopeOption[] = [
    { key: selectionKey({ store, category: null }), label: allLabel },
    ...categories.map((root) => ({
      key: selectionKey({ store, category: root.slug }),
      label: root.name,
    })),
  ];
  if (selection.store === store && selection.category) {
    const key = selectionKey(selection);
    if (!options.some((option) => option.key === key)) {
      const label = findName(categories, selection.category) ?? labelFromSlug(selection.category);
      options.splice(1, 0, { key, label });
    }
  }
  return options;
}

/**
 * Un `<select>` nativo, invisible, sobre una píldora que muestra lo elegido.
 * Nativo a propósito: en teléfono abre la rueda del sistema, se maneja con
 * teclado y lector de pantalla sin nada más, y con decenas de categorías es
 * lo que mejor se recorre. En teléfono la píldora es solo un icono (el ancho
 * es de la caja); a partir de `sm` muestra el nombre.
 */
function ScopeSelect({
  value,
  selection,
  pageStore,
  storeName,
  storeCategories,
  globalCategories,
  onChange,
  labels,
}: ScopeSelectProps) {
  const storeLabel = storeName ?? (pageStore ? labelFromSlug(pageStore) : "");
  const storeGroup = pageStore
    ? groupOptions(
        pageStore,
        labels.wholeStore.replace("{store}", storeLabel),
        storeCategories,
        selection,
      )
    : [];
  const globalGroup = groupOptions(null, labels.allCategories, globalCategories, selection);

  // Lo que se lee en la píldora: corto. "Todas" y no "Todas las categorías",
  // y en una tienda su nombre y no "Todo en …".
  const shown =
    selection.category === null
      ? selection.store
        ? storeLabel
        : labels.all
      : ([...storeGroup, ...globalGroup].find((option) => option.key === value)?.label ??
        labelFromSlug(selection.category));
  const isScoped = selection.store !== null || selection.category !== null;

  return (
    <div
      className={`relative flex h-10 shrink-0 items-center gap-1 rounded-l-full border border-r-0 border-[var(--border)] bg-[var(--bg-subtle)] pr-2 pl-3 text-[0.8125rem] font-medium shadow-[var(--shadow-sm)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-[var(--accent)] sm:pl-4 ${
        isScoped ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 sm:hidden"
      >
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
      <span aria-hidden="true" className="hidden max-w-[9rem] truncate sm:block">
        {shown}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 shrink-0 opacity-70"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>

      <select
        aria-label={labels.scope}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {pageStore ? (
          <>
            <optgroup label={storeLabel}>
              {storeGroup.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={labels.allStores}>
              {globalGroup.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          </>
        ) : (
          globalGroup.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
