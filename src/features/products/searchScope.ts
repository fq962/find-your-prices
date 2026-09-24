import type { Locale } from "@/features/i18n/translate";
import { SITE_ROUTES } from "@/features/i18n/routes";
import { categoryPaths } from "@/lib/seo/categorySeo";
import { storeCategoryPaths, storePaths } from "@/lib/seo/storeSeo";
import { catalogUrlSearch, EMPTY_CATALOG_URL_STATE, type CatalogUrlState } from "./catalogUrlState";

/**
 * El alcance del buscador de la barra: en qué tienda y en qué categoría se
 * busca, como el selector de departamentos de Amazon.
 *
 * Módulo puro —sin React ni red— para probarlo sin montar nada. Resuelve tres
 * preguntas:
 *
 *   1. En qué página se está (`parseSearchPage`): la portada, una landing de
 *      tienda (sola o con categoría), una de categoría, u otra cualquiera.
 *   2. Qué opción muestra el selector (`pageSelection`): la que la página ya
 *      representa. En la tienda, "todo en la tienda"; en "Abarrotes en
 *      PriceSmart", esa combinación.
 *   3. Qué hacer al buscar (`resolveSearch`): si el alcance elegido es el de
 *      la página, se busca ahí mismo escribiendo la URL; si no, se navega a
 *      la página que lo representa.
 */

/** Id del bloque de resultados: ancla a la que se salta al buscar. */
export const RESULTS_ANCHOR = "resultados";

export type SearchPage =
  | { kind: "home" }
  | { kind: "store"; store: string; category: string | null }
  | { kind: "category"; category: string }
  | { kind: "other" };

export interface SearchSelection {
  store: string | null;
  category: string | null;
}

const STORE_SEGMENT: Record<Locale, string> = { es: "tiendas", en: "stores" };
const CATEGORY_SEGMENT: Record<Locale, string> = { es: "categorias", en: "categories" };

export function parseSearchPage(pathname: string, locale: Locale): SearchPage {
  const home = SITE_ROUTES.home[locale];
  if (pathname === home || pathname === `${home}/`) return { kind: "home" };

  const prefix = locale === "en" ? "/en/" : "/";
  if (!pathname.startsWith(prefix)) return { kind: "other" };
  const segments = pathname
    .slice(prefix.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments[0] === STORE_SEGMENT[locale] && segments.length >= 2 && segments.length <= 3) {
    return { kind: "store", store: segments[1], category: segments[2] ?? null };
  }
  if (segments[0] === CATEGORY_SEGMENT[locale] && segments.length === 2) {
    return { kind: "category", category: segments[1] };
  }
  return { kind: "other" };
}

/**
 * La opción que representa la página actual.
 *
 * En la portada y en la tienda sola la categoría sale de la URL (la faceta
 * del panel y el selector son la misma cosa). En una landing acotada a una
 * categoría manda la de la ruta: ahí la URL solo lleva subcategorías.
 */
export function pageSelection(page: SearchPage, url: CatalogUrlState): SearchSelection {
  const fromUrl = url.category.length === 1 ? url.category[0] : null;
  switch (page.kind) {
    case "home":
      return { store: null, category: fromUrl };
    case "store":
      return { store: page.store, category: page.category ?? fromUrl };
    case "category":
      return { store: null, category: page.category };
    default:
      return { store: null, category: null };
  }
}

/** Si buscar con esta opción se resuelve en la propia página. */
export function isInPlace(page: SearchPage, selection: SearchSelection): boolean {
  switch (page.kind) {
    case "home":
      return selection.store === null;
    case "store":
      return (
        selection.store === page.store &&
        (page.category === null || selection.category === page.category)
      );
    case "category":
      return selection.store === null && selection.category === page.category;
    default:
      return false;
  }
}

/**
 * Lo que la página escribe en su URL al buscar ahí mismo. En la portada y en
 * la tienda sola la categoría elegida es la faceta; en una landing acotada ya
 * está en la ruta y la faceta (subcategorías) se deja como estaba.
 */
export function inPlaceState(
  page: SearchPage,
  selection: SearchSelection,
  current: CatalogUrlState,
  query: string,
): CatalogUrlState {
  const scopedByRoute = page.kind === "category" || (page.kind === "store" && page.category !== null);
  if (scopedByRoute) return { ...current, query };
  return { ...current, query, category: selection.category ? [selection.category] : [] };
}

/**
 * La página que representa un alcance, con la búsqueda puesta y el ancla de
 * los resultados: la combinación tienda × categoría es su landing, la tienda
 * sola la suya, la categoría sola la suya, y sin nada la portada.
 */
export function searchHref(selection: SearchSelection, query: string, locale: Locale): string {
  const search = catalogUrlSearch({ ...EMPTY_CATALOG_URL_STATE, query });
  const path =
    selection.store && selection.category
      ? storeCategoryPaths(selection.store, selection.category)[locale]
      : selection.store
        ? storePaths(selection.store)[locale]
        : selection.category
          ? categoryPaths(selection.category)[locale]
          : SITE_ROUTES.home[locale];
  return `${path}${search}#${RESULTS_ANCHOR}`;
}

/** Valor del `<option>`: tienda y categoría en una cadena. */
export function selectionKey(selection: SearchSelection): string {
  return `${selection.store ?? ""}|${selection.category ?? ""}`;
}

export function parseSelectionKey(key: string): SearchSelection {
  const [store = "", category = ""] = key.split("|");
  return { store: store || null, category: category || null };
}

// ---------------------------------------------------------------------------
// Aviso de "ampliamos la búsqueda"
//
// Cuando una búsqueda acotada no encuentra nada se amplía a todas las
// categorías. Si eso obliga a cambiar de página, el aviso cruza la
// navegación en sessionStorage, pegado a la búsqueda que lo produjo.
// ---------------------------------------------------------------------------

export interface WidenedNotice {
  query: string;
  /** Nombre de la categoría donde no hubo resultados. */
  from: string;
}

const WIDENED_KEY = "fyp.search.widened";

export function saveWidenedNotice(notice: WidenedNotice): void {
  try {
    window.sessionStorage.setItem(WIDENED_KEY, JSON.stringify(notice));
  } catch {
    // Sin almacenamiento se amplía igual; solo se pierde el aviso.
  }
}

/** Lee y borra el aviso: se muestra una vez, en la página a la que se llegó. */
export function takeWidenedNotice(): WidenedNotice | null {
  try {
    const raw = window.sessionStorage.getItem(WIDENED_KEY);
    window.sessionStorage.removeItem(WIDENED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WidenedNotice>;
    return typeof parsed.query === "string" && typeof parsed.from === "string"
      ? { query: parsed.query, from: parsed.from }
      : null;
  } catch {
    return null;
  }
}
