import { EMPTY_FILTER_STATE, type CatalogFilterState } from "./catalogFilters";
import { DEFAULT_SORT, isSortOption, type SortOption } from "./sortProducts";

/**
 * El estado del catálogo, ida y vuelta con la barra de direcciones.
 *
 * Antes la búsqueda y los filtros vivían sólo en memoria: "iphone" ordenado por
 * precio devolvía la misma URL que la portada. Eso rompe tres cosas a la vez y
 * ninguna es cosmética —compartir el enlace de una búsqueda, guardarla en
 * marcadores, y recargar sin perder lo que se llevaba puesto.
 *
 * Los nombres de los parámetros son los MISMOS que los de `/api/products/search`
 * a propósito. Es lo que hace que la URL que se comparte y la consulta que sale
 * al servidor se lean igual, y que no haya un tercer diccionario de
 * equivalencias que se pueda desincronizar.
 *
 * Módulo puro —sin React ni DOM— para poder probarlo sin montar nada.
 */

export interface CatalogUrlState {
  query: string;
  store?: string;
  category?: string;
  sort: SortOption;
  filters: CatalogFilterState;
}

/** Portada limpia: ni búsqueda, ni facetas, ni orden elegido a mano. */
export const EMPTY_CATALOG_URL_STATE: CatalogUrlState = {
  query: "",
  store: undefined,
  category: undefined,
  sort: DEFAULT_SORT,
  filters: EMPTY_FILTER_STATE,
};

/** Un parámetro vacío es lo mismo que no traerlo. */
function text(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name)?.trim();
  return raw ? raw : undefined;
}

/**
 * Lee un número respetando el 0 y descartando basura. Un `minPrice=abc` no
 * puede convertirse en `NaN` y viajar hasta Postgres.
 */
function amount(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Estado a partir de la query string (con o sin "?" delante).
 *
 * Todo lo que no se entienda cae al default en vez de romper: una URL
 * compartida por alguien que la editó a mano tiene que abrir el catálogo, no
 * una pantalla en blanco.
 */
export function parseCatalogUrl(search: string): CatalogUrlState {
  const params = new URLSearchParams(search);
  const rawSort = params.get("sort");

  return {
    query: params.get("q") ?? "",
    store: text(params, "store"),
    category: text(params, "category"),
    sort: rawSort && isSortOption(rawSort) ? rawSort : DEFAULT_SORT,
    filters: {
      minPrice: amount(params, "minPrice"),
      maxPrice: amount(params, "maxPrice"),
      brand: text(params, "brand"),
      onlyDiscounted: params.get("onlyDiscounted") === "1",
      includeUnavailable: params.get("includeUnavailable") === "1",
    },
  };
}

/**
 * La query string que representa este estado, con "?" delante, o cadena vacía
 * si no hay nada que representar.
 *
 * Lo que está en su valor por defecto NO se escribe. Es lo que mantiene la
 * portada en "findyourprices.com" a secas en vez de en una URL con seis
 * parámetros que dicen "nada seleccionado", y lo que hace que dos personas que
 * llegaron al mismo sitio por caminos distintos compartan el mismo enlace.
 */
export function catalogUrlSearch(state: CatalogUrlState): string {
  const params = new URLSearchParams();

  // Sólo se descarta la búsqueda EN BLANCO; lo demás viaja tal cual se tecleó.
  // Recortarla acá haría que el campo perdiera el espacio final mientras se
  // escribe, porque lo que se ve sale de vuelta de la URL.
  if (state.query.trim()) params.set("q", state.query);
  if (state.store) params.set("store", state.store);
  if (state.category) params.set("category", state.category);
  if (state.filters.brand) params.set("brand", state.filters.brand);
  if (state.filters.minPrice !== undefined) params.set("minPrice", String(state.filters.minPrice));
  if (state.filters.maxPrice !== undefined) params.set("maxPrice", String(state.filters.maxPrice));
  if (state.filters.onlyDiscounted) params.set("onlyDiscounted", "1");
  if (state.filters.includeUnavailable) params.set("includeUnavailable", "1");
  // El orden por defecto no se escribe: es el que ya sirve la página.
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort);

  const search = params.toString();
  return search ? `?${search}` : "";
}

// ---------------------------------------------------------------------------
// Store para useSyncExternalStore
//
// La barra de direcciones es estado externo y mutable —la escribe esta app,
// pero también el botón de retroceso y quien pega un enlace—, que es
// exactamente el caso para el que existe useSyncExternalStore. Es el mismo
// patrón que `viewPreferences` usa con localStorage.
//
// La alternativa era un useState sembrado desde un useEffect, y tiene dos
// defectos que no se ven hasta que molestan: provoca un render en cascada en
// cada montaje, y obliga a duplicar el estado en dos sitios que se pueden
// contradecir —el de React y el de la URL—.
//
// getSnapshot DEBE devolver la misma referencia mientras nada cambie: si
// devolviera un objeto nuevo en cada llamada, React entraría en un bucle de
// renders. De ahí la caché, con la propia query string como llave de validez.
// ---------------------------------------------------------------------------

let cached: { search: string; state: CatalogUrlState } | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToCatalogUrl(listener: () => void): () => void {
  listeners.add(listener);

  // El botón de retroceso cambia la URL sin pasar por acá. Sin esto, volver
  // atrás dejaría la dirección diciendo una cosa y la lista mostrando otra.
  const onPopState = () => {
    cached = null;
    notify();
  };
  window.addEventListener("popstate", onPopState);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", onPopState);
  };
}

export function getCatalogUrlSnapshot(): CatalogUrlState {
  if (typeof window === "undefined") return EMPTY_CATALOG_URL_STATE;

  const search = window.location.search;
  if (cached === null || cached.search !== search) {
    cached = { search, state: parseCatalogUrl(search) };
  }
  return cached.state;
}

/**
 * En el servidor no hay URL que leer: la home se sirve estática y cacheada, y
 * su HTML es siempre el del catálogo sin filtrar. Devolver la misma constante
 * es lo que hace que ese HTML y el primer render del cliente coincidan; React
 * reconcilia después con lo que diga la dirección real.
 *
 * El precio es un instante con el catálogo por defecto antes de que aparezcan
 * los resultados del enlace compartido. Es el correcto: la alternativa era
 * volver dinámica la portada —la página con más tráfico del sitio— para
 * resolver en el servidor un caso que ocurre en una visita de cada cien.
 */
export function getCatalogUrlServerSnapshot(): CatalogUrlState {
  return EMPTY_CATALOG_URL_STATE;
}

/**
 * Escribe el estado en la barra de direcciones.
 *
 * `replaceState` y no `pushState`: cada tecla, cada casilla y cada cambio de
 * orden dejaría su propia entrada en el historial, y volver atrás desde una
 * búsqueda sería pulsar el botón veinte veces para salir del catálogo.
 *
 * La caché se invalida en vez de rellenarse con `next`, y no es un detalle: así
 * lo que se ve sale SIEMPRE de leer la URL, y un estado que no se puede
 * representar en ella (un filtro en su valor por defecto, por ejemplo) no puede
 * sobrevivir escondido en memoria.
 */
export function writeCatalogUrl(next: CatalogUrlState): void {
  if (typeof window === "undefined") return;

  const { pathname, hash } = window.location;
  const url = `${pathname}${catalogUrlSearch(next)}${hash}`;

  if (url !== `${pathname}${window.location.search}${hash}`) {
    window.history.replaceState(null, "", url);
  }

  cached = null;
  notify();
}
