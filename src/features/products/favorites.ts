/**
 * Favoritos: los productos que alguien marcó con el corazón para volver a
 * verlos después.
 *
 * Es distinto de la bandeja de comparación (`compareTray`): aquella responde
 * "¿cuál de estos cuatro me conviene?" y por eso tiene tope; esta es una lista
 * de deseos y crece hasta donde alguien quiera. Lo que sí comparten es la
 * forma: lógica pura sin React ni DOM salvo el acceso guardado a
 * `localStorage`, y un store para `useSyncExternalStore`.
 *
 * Se guarda el producto entero y no solo el id: la página de favoritos tiene
 * que pintarse sin ir a la base, y el sitio no tiene cuentas de usuario, así
 * que no hay otro lugar donde persista. El precio que se muestra ahí es el del
 * momento en que se marcó; la ficha del producto trae el vigente.
 */

import type { Product } from "@/types";

/**
 * Tope de favoritos guardados.
 *
 * No es un límite de producto sino de almacenamiento: cada favorito pesa
 * ~600 bytes con su descripción, y `localStorage` suele cortar en 5 MB
 * compartidos con el resto del sitio. Doscientos entran en ~120 KB y ninguna
 * persona real marca más que eso a mano. Al llegar al tope se descarta el
 * MÁS ANTIGUO, no el nuevo: quien marca algo hoy espera verlo guardado.
 */
export const MAX_FAVORITES = 200;

const STORAGE_KEY = "fyp.favorites";

// ---------------------------------------------------------------------------
// Operaciones puras
// ---------------------------------------------------------------------------

export function isFavorite(favorites: Product[], productId: string): boolean {
  return favorites.some((product) => product.id === productId);
}

/**
 * Agrega o quita según lo que ya haya. Nunca muta la entrada.
 *
 * Lo nuevo va al PRINCIPIO: la página de favoritos se lee de arriba abajo y lo
 * último que se marcó es lo que se está buscando ahora mismo.
 */
export function toggleFavorite(favorites: Product[], product: Product): Product[] {
  if (isFavorite(favorites, product.id)) {
    return favorites.filter((candidate) => candidate.id !== product.id);
  }
  return [product, ...favorites];
}

export function removeFavorite(favorites: Product[], productId: string): Product[] {
  return favorites.filter((product) => product.id !== productId);
}

/** Lo mínimo que necesita una tarjeta para pintarse. */
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
 * colapsa ids repetidos (se queda con la primera aparición, que es la más
 * reciente) y recorta al tope por el final.
 *
 * Se aplica tanto al leer de `localStorage` (que puede traer datos de una
 * versión anterior del esquema) como al escribir.
 */
export function normalizeFavorites(value: unknown): Product[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: Product[] = [];

  for (const item of value) {
    if (!isProductLike(item)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
    if (result.length === MAX_FAVORITES) break;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

/**
 * Lee los favoritos guardados. Devuelve una lista vacía ante cualquier
 * problema —modo privado, datos borrados, JSON corrupto— en vez de propagar el
 * error: una lista perdida es un inconveniente, una pantalla rota no.
 */
export function readFavorites(): Product[] {
  if (typeof window === "undefined") return EMPTY_FAVORITES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FAVORITES;
    return normalizeFavorites(JSON.parse(raw));
  } catch {
    return EMPTY_FAVORITES;
  }
}

export function writeFavorites(favorites: Product[]): void {
  const normalized = normalizeFavorites(favorites);
  cachedSnapshot = normalized;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Cuota llena o almacenamiento bloqueado: la lista se pierde al
      // recargar, pero la sesión actual sigue funcionando.
    }
  }

  notify();
}

// ---------------------------------------------------------------------------
// Store para useSyncExternalStore
//
// Mismo patrón que `compareTray`: `getSnapshot` DEBE devolver la misma
// referencia mientras nada cambie, o React entra en un bucle de renders. De ahí
// la caché y el array vacío constante.
// ---------------------------------------------------------------------------

const EMPTY_FAVORITES: Product[] = [];

let cachedSnapshot: Product[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToFavorites(listener: () => void): () => void {
  listeners.add(listener);

  // El evento 'storage' solo lo disparan OTRAS pestañas: marcar un favorito
  // en una lo deja sincronizado en las demás.
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

export function getFavoritesSnapshot(): Product[] {
  if (cachedSnapshot === null) cachedSnapshot = readFavorites();
  return cachedSnapshot;
}

/**
 * En el servidor no hay favoritos guardados. Devolver siempre el mismo array
 * vacío es lo que hace que el HTML del servidor y el primer render del cliente
 * coincidan; React reconcilia después con el valor real.
 */
export function getFavoritesServerSnapshot(): Product[] {
  return EMPTY_FAVORITES;
}
