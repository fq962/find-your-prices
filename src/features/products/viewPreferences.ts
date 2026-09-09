/**
 * Preferencias de visualización del catálogo.
 *
 * Lógica pura, sin React ni DOM salvo el acceso guardado a `localStorage`.
 *
 * Por qué se persiste: cómo alguien quiere ver una lista de precios es una
 * preferencia estable, no una decisión por sesión. Quien compara
 * electrodomésticos quiere fichas grandes con foto; quien rastrea el precio de
 * un producto concreto quiere filas densas. Preguntarlo de nuevo en cada
 * visita sería obligarlo a repetir una decisión que ya tomó.
 */

export const VIEW_MODES = ["list", "grid", "gallery", "compare"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const DENSITIES = ["compact", "cosy", "roomy"] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * Galería de entrada.
 *
 * La lista es la vista para rastrear un precio concreto, pero quien llega no
 * está rastreando: está mirando. Una fila de texto no dice qué es el producto
 * y la cuadrícula apretada convierte el catálogo en una pared. La galería
 * enseña la foto lo bastante grande para reconocer la cosa de un vistazo, que
 * es lo primero que hace cualquiera que entra.
 */
export const DEFAULT_VIEW_MODE: ViewMode = "gallery";
export const DEFAULT_DENSITY: Density = "cosy";

/**
 * Cuántas tiendas se enfrentan a la vez en el modo comparar.
 *
 * El tope es cuatro y no es arbitrario: con cinco columnas el nombre de un
 * producto baja de ~20 caracteres visibles en un portátil y comparar deja de
 * ser leer para pasar a ser adivinar. Dos es el default porque comparar es, en
 * la práctica, "esta tienda contra esta otra".
 */
export const MIN_COMPARE_COLUMNS = 2;
export const MAX_COMPARE_COLUMNS = 4;
export const DEFAULT_COMPARE_COLUMNS = 2;

export interface ViewPreferences {
  mode: ViewMode;
  density: Density;
  compareColumns: number;
}

export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  mode: DEFAULT_VIEW_MODE,
  density: DEFAULT_DENSITY,
  compareColumns: DEFAULT_COMPARE_COLUMNS,
};

/** Recorta al rango publicado cualquier valor guardado o llegado de la UI. */
export function clampCompareColumns(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_COMPARE_COLUMNS;
  return Math.min(Math.max(parsed, MIN_COMPARE_COLUMNS), MAX_COMPARE_COLUMNS);
}

const STORAGE_KEY = "fyp.catalog.view";

export function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VIEW_MODES as readonly string[]).includes(value);
}

export function isDensity(value: unknown): value is Density {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value);
}

/**
 * Lee las preferencias guardadas.
 *
 * Devuelve los valores por defecto ante cualquier problema —modo privado,
 * datos borrados, JSON corrupto de una versión anterior— en vez de propagar el
 * error: una preferencia de presentación nunca debe impedir ver el catálogo.
 */
export function readViewPreferences(): ViewPreferences {
  if (typeof window === "undefined") return DEFAULT_VIEW_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW_PREFERENCES;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_VIEW_PREFERENCES;

    const candidate = parsed as Record<string, unknown>;
    return {
      mode: isViewMode(candidate.mode) ? candidate.mode : DEFAULT_VIEW_MODE,
      density: isDensity(candidate.density) ? candidate.density : DEFAULT_DENSITY,
      compareColumns: clampCompareColumns(candidate.compareColumns),
    };
  } catch {
    return DEFAULT_VIEW_PREFERENCES;
  }
}

export function writeViewPreferences(preferences: ViewPreferences): void {
  cachedSnapshot = preferences;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Cuota llena o almacenamiento bloqueado: la preferencia se pierde al
    // recargar, pero la sesión actual sigue funcionando. No hay nada que
    // reportarle al usuario.
  }
  notify();
}

// ---------------------------------------------------------------------------
// Store para useSyncExternalStore
//
// localStorage es estado externo y mutable, que es exactamente el caso para el
// que existe useSyncExternalStore. La alternativa —useState más un useEffect
// que lo rellena— provoca un render en cascada en cada montaje y obliga a
// duplicar el valor por defecto en dos sitios.
//
// getSnapshot DEBE devolver la misma referencia mientras nada cambie: si
// devolviera un objeto nuevo en cada llamada, React entraría en un bucle de
// renders. De ahí la caché.
// ---------------------------------------------------------------------------

let cachedSnapshot: ViewPreferences | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToViewPreferences(listener: () => void): () => void {
  listeners.add(listener);

  // El evento 'storage' solo lo disparan OTRAS pestañas: cambiar la vista en
  // una deja sincronizadas las demás.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cachedSnapshot = null;
    notify();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getViewPreferencesSnapshot(): ViewPreferences {
  if (cachedSnapshot === null) cachedSnapshot = readViewPreferences();
  return cachedSnapshot;
}

/**
 * En el servidor no hay preferencia guardada. Devolver siempre el mismo objeto
 * constante es lo que hace que el HTML del servidor y el primer render del
 * cliente coincidan; React reconcilia después con el valor real.
 */
export function getViewPreferencesServerSnapshot(): ViewPreferences {
  return DEFAULT_VIEW_PREFERENCES;
}

/**
 * Clases de la cuadrícula por modo y densidad.
 *
 * Mobile-first y con saltos elegidos por el ancho mínimo legible de una
 * ficha, no por múltiplos redondos: en `grid` compacto una tarjeta baja de
 * ~150px y el nombre del producto deja de leerse.
 *
 * El número de columnas está deliberadamente por debajo de lo que el ancho
 * permitiría. Caben más; con más, cada ficha se encoge hasta que la foto deja
 * de servir para reconocer el producto y la pantalla se vuelve una pared de
 * tarjetas que no invita a mirar ninguna. La galería nunca pasa de dos.
 */
export function gridClassesFor(mode: ViewMode, density: Density): string {
  if (mode === "list" || mode === "compare") return "";

  if (mode === "gallery") {
    return {
      compact: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
      cosy: "grid grid-cols-1 gap-5 sm:gap-6 sm:grid-cols-2",
      roomy: "grid grid-cols-1 gap-6",
    }[density];
  }

  return {
    compact: "grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4",
    cosy: "grid grid-cols-2 gap-4 sm:gap-5 sm:grid-cols-3",
    roomy: "grid grid-cols-1 gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3",
  }[density];
}

/** Alto de la imagen en las vistas de ficha. */
export function imageHeightFor(mode: Exclude<ViewMode, "list" | "compare">, density: Density): string {
  if (mode === "gallery") {
    return { compact: "h-52", cosy: "h-64", roomy: "h-80" }[density];
  }
  return { compact: "h-28", cosy: "h-40", roomy: "h-52" }[density];
}
