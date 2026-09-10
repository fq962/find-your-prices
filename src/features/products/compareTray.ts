/**
 * Bandeja de comparación: los productos concretos que alguien apartó para
 * mirarlos uno al lado del otro.
 *
 * Es una cosa distinta del modo "Comparar" por tienda (`useStoreComparison`).
 * Aquel responde "¿cuál de estas tiendas tiene esto más barato?" recorriendo
 * catálogos enteros; esta bandeja responde "¿cuál de estos cuatro me conviene?"
 * sobre artículos elegidos a mano, que pueden ser de la misma tienda o de
 * cuatro distintas.
 *
 * Lógica pura, sin React ni DOM salvo el acceso guardado a `localStorage`,
 * igual que `viewPreferences`. Se persiste porque comparar rara vez se resuelve
 * de una sentada: se apartan dos artículos, se sigue buscando, se agrega un
 * tercero. Perder esa selección al recargar obligaría a rehacer el trabajo.
 */

import type { Product } from "@/types";

/**
 * Tope de artículos en la bandeja.
 *
 * Cuatro es el mismo tope que el de columnas por tienda, y por la misma razón:
 * con cinco columnas el nombre de un producto baja de ~20 caracteres visibles
 * en un portátil y la tabla deja de poder leerse de un vistazo.
 */
export const MAX_COMPARE_ITEMS = 4;

const STORAGE_KEY = "fyp.catalog.compare";

// ---------------------------------------------------------------------------
// Operaciones puras
// ---------------------------------------------------------------------------

export function isInTray(tray: Product[], productId: string): boolean {
  return tray.some((product) => product.id === productId);
}

export function isTrayFull(tray: Product[]): boolean {
  return tray.length >= MAX_COMPARE_ITEMS;
}

/**
 * Agrega o quita según lo que ya haya.
 *
 * Con la bandeja llena y un producto nuevo devuelve la MISMA referencia, sin
 * tocar nada: quitar en silencio el primero para hacer sitio haría desaparecer
 * algo que el usuario eligió a propósito. Quien llama distingue el caso con
 * `isTrayFull` y deshabilita el control antes de que se pueda pulsar.
 */
export function toggleInTray(tray: Product[], product: Product): Product[] {
  if (isInTray(tray, product.id)) {
    return tray.filter((candidate) => candidate.id !== product.id);
  }
  if (isTrayFull(tray)) return tray;
  return [...tray, product];
}

export function removeFromTray(tray: Product[], productId: string): Product[] {
  return tray.filter((product) => product.id !== productId);
}

/** Lo mínimo que necesita la tabla de comparación para pintar una columna. */
function isProductLike(value: unknown): value is Product {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id !== "" &&
    typeof candidate.name === "string" &&
    typeof candidate.price === "number" &&
    Number.isFinite(candidate.price) &&
    typeof candidate.currency === "string" &&
    typeof candidate.store === "string"
  );
}

/**
 * Normaliza lo que venga de fuera: descarta lo que no sea un producto usable,
 * colapsa ids repetidos y recorta al tope.
 *
 * Se aplica tanto al leer de `localStorage` (que puede traer datos de una
 * versión anterior del esquema) como al escribir, para que el tope no dependa
 * de que todos los que llaman se acuerden de respetarlo.
 */
export function normalizeTray(value: unknown): Product[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: Product[] = [];

  for (const item of value) {
    if (!isProductLike(item)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length === MAX_COMPARE_ITEMS) break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

/**
 * Lee la bandeja guardada. Devuelve una vacía ante cualquier problema —modo
 * privado, datos borrados, JSON corrupto— en vez de propagar el error: una
 * selección perdida es un inconveniente, una pantalla rota no.
 */
export function readCompareTray(): Product[] {
  if (typeof window === "undefined") return EMPTY_TRAY;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_TRAY;
    return normalizeTray(JSON.parse(raw));
  } catch {
    return EMPTY_TRAY;
  }
}

export function writeCompareTray(tray: Product[]): void {
  const normalized = normalizeTray(tray);
  cachedSnapshot = normalized;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Cuota llena o almacenamiento bloqueado: la selección se pierde al
      // recargar, pero la sesión actual sigue funcionando.
    }
  }

  notify();
}

// ---------------------------------------------------------------------------
// Store para useSyncExternalStore
//
// Mismo patrón que `viewPreferences`: `getSnapshot` DEBE devolver la misma
// referencia mientras nada cambie, o React entra en un bucle de renders. De ahí
// la caché y el array vacío constante.
// ---------------------------------------------------------------------------

const EMPTY_TRAY: Product[] = [];

let cachedSnapshot: Product[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToCompareTray(listener: () => void): () => void {
  listeners.add(listener);

  // El evento 'storage' solo lo disparan OTRAS pestañas: apartar un producto en
  // una deja la bandeja sincronizada en las demás.
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

export function getCompareTraySnapshot(): Product[] {
  if (cachedSnapshot === null) cachedSnapshot = readCompareTray();
  return cachedSnapshot;
}

/**
 * En el servidor no hay bandeja guardada. Devolver siempre el mismo array vacío
 * es lo que hace que el HTML del servidor y el primer render del cliente
 * coincidan; React reconcilia después con el valor real.
 */
export function getCompareTrayServerSnapshot(): Product[] {
  return EMPTY_TRAY;
}
