/**
 * Carrito: la lista de cosas que alguien piensa comprar, con cantidades.
 *
 * No es un carrito de tienda —el sitio no vende nada—. Es la materia prima de
 * la cotización: "necesito estas doce cosas, ¿dónde compro cada una y cuánto
 * me sale todo?". Por eso cada renglón lleva cantidad, y por eso se puede
 * cambiar un renglón por el mismo artículo en otra tienda sin perderla.
 *
 * Mismo molde que `favorites`: lógica pura sin React ni DOM, salvo el acceso
 * guardado a `localStorage`, y un store para `useSyncExternalStore`.
 */

import type { Product } from "@/types";
import type { CartLine } from "./types";

/**
 * Tope de renglones. Como en favoritos es un límite de almacenamiento (~700
 * bytes por renglón) y de la consulta de precios vigentes, no de producto:
 * nadie cotiza a mano más de cien artículos distintos.
 */
export const MAX_CART_LINES = 100;

/** Cantidad máxima por renglón. Lo que pase de acá es un error de dedo. */
export const MAX_QUANTITY = 999;

const STORAGE_KEY = "fyp.cart";

// ---------------------------------------------------------------------------
// Operaciones puras
// ---------------------------------------------------------------------------

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.round(value)));
}

export function isInCart(lines: CartLine[], productId: string): boolean {
  return lines.some((line) => line.product.id === productId);
}

export function quantityOf(lines: CartLine[], productId: string): number {
  return lines.find((line) => line.product.id === productId)?.quantity ?? 0;
}

/**
 * Agrega un producto. Si ya estaba, suma a la cantidad en vez de duplicar el
 * renglón: dos renglones del mismo artículo partirían el subtotal en dos.
 *
 * Lo nuevo va AL FINAL, al revés que en favoritos: una lista de compras se
 * arma en orden y se lee en ese orden.
 */
export function addToCart(
  lines: CartLine[],
  product: Product,
  quantity = 1,
  now: Date = new Date(),
): CartLine[] {
  if (isInCart(lines, product.id)) {
    return lines.map((line) =>
      line.product.id === product.id
        ? { ...line, quantity: clampQuantity(line.quantity + quantity) }
        : line,
    );
  }
  return [...lines, { product, quantity: clampQuantity(quantity), addedAt: now.toISOString() }];
}

export function setQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  return lines.map((line) =>
    line.product.id === productId ? { ...line, quantity: clampQuantity(quantity) } : line,
  );
}

export function removeFromCart(lines: CartLine[], productId: string): CartLine[] {
  return lines.filter((line) => line.product.id !== productId);
}

/**
 * Cambia un renglón por el mismo artículo en otra tienda, conservando la
 * cantidad y el lugar en la lista. Si el reemplazo ya estaba en el carrito,
 * los dos renglones se funden en uno con la suma de cantidades.
 */
export function replaceInCart(
  lines: CartLine[],
  fromId: string,
  product: Product,
  now: Date = new Date(),
): CartLine[] {
  const source = lines.find((line) => line.product.id === fromId);
  if (!source || fromId === product.id) return lines;

  const existing = lines.find((line) => line.product.id === product.id);
  if (existing) {
    return lines
      .filter((line) => line.product.id !== fromId)
      .map((line) =>
        line.product.id === product.id
          ? { ...line, quantity: clampQuantity(line.quantity + source.quantity) }
          : line,
      );
  }

  return lines.map((line) =>
    line.product.id === fromId
      ? { product, quantity: source.quantity, addedAt: now.toISOString() }
      : line,
  );
}

/** Lo mínimo que necesita un renglón para pintarse. */
function isCartLineLike(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const product = candidate.product as Record<string, unknown> | undefined;
  return (
    typeof product === "object" &&
    product !== null &&
    typeof product.id === "string" &&
    product.id !== "" &&
    typeof product.name === "string" &&
    typeof product.price === "number" &&
    Number.isFinite(product.price) &&
    typeof product.currency === "string" &&
    typeof product.store === "string"
  );
}

/**
 * Normaliza lo que venga de fuera: descarta renglones inservibles, colapsa ids
 * repetidos sumando cantidades, repara cantidades y fechas, y recorta al tope.
 */
export function normalizeCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];

  const result: CartLine[] = [];
  const indexById = new Map<string, number>();

  for (const item of value) {
    if (!isCartLineLike(item)) continue;
    const quantity = clampQuantity(Number(item.quantity));
    const known = indexById.get(item.product.id);
    if (known !== undefined) {
      result[known] = {
        ...result[known],
        quantity: clampQuantity(result[known].quantity + quantity),
      };
      continue;
    }
    if (result.length === MAX_CART_LINES) continue;
    const addedAt =
      typeof item.addedAt === "string" && !Number.isNaN(Date.parse(item.addedAt))
        ? item.addedAt
        : new Date(0).toISOString();
    indexById.set(item.product.id, result.length);
    result.push({ product: item.product, quantity, addedAt });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

export function readCart(): CartLine[] {
  if (typeof window === "undefined") return EMPTY_CART;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CART;
    return normalizeCart(JSON.parse(raw));
  } catch {
    return EMPTY_CART;
  }
}

export function writeCart(lines: CartLine[]): void {
  const normalized = normalizeCart(lines);
  cachedSnapshot = normalized;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Cuota llena o almacenamiento bloqueado: la sesión actual sigue.
    }
  }

  notify();
}

// ---------------------------------------------------------------------------
// Store para useSyncExternalStore (ver `favorites` para el porqué de la caché)
// ---------------------------------------------------------------------------

const EMPTY_CART: CartLine[] = [];

let cachedSnapshot: CartLine[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToCart(listener: () => void): () => void {
  listeners.add(listener);

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

export function getCartSnapshot(): CartLine[] {
  if (cachedSnapshot === null) cachedSnapshot = readCart();
  return cachedSnapshot;
}

export function getCartServerSnapshot(): CartLine[] {
  return EMPTY_CART;
}
