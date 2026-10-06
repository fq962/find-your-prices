/**
 * Arma la cotización a partir del carrito y de lo que respondió el servidor.
 *
 * Lógica pura, sin React: entra el carrito y (si llegó) el mapa de ofertas
 * vigentes; sale la cotización agrupada por tienda, con totales y sugerencias.
 * Si el servidor no respondió, la cotización se arma igual con las fotos
 * guardadas en el carrito y marca cada renglón como no vigente.
 */

import type { Product } from "@/types";
import type { CartLine, QuoteLineResult, QuoteOffer } from "./types";

/** Totales por moneda. Casi siempre una sola (HNL), pero no se asume. */
export type MoneyByCurrency = Record<string, number>;

export interface QuoteItem {
  line: CartLine;
  /** La oferta que se cotiza: la vigente o, sin servidor, la guardada. */
  offer: QuoteOffer;
  /** `true` si `offer` viene del servidor y no de la foto del carrito. */
  fresh: boolean;
  /** Ya no se puede comprar ahí: inactivo, agotado o descontinuado. */
  unavailable: boolean;
  /** Cuánto cambió el precio desde que se agregó. Positivo = subió. */
  priceDelta: number;
  subtotal: number;
  /**
   * Mejor opción en otra tienda: más barata si este renglón se puede comprar,
   * la primera disponible si no. Siempre en la misma moneda.
   */
  better?: QuoteOffer;
  /** Ahorro total del renglón al cambiarse a `better` (0 si no es más barata). */
  savings: number;
}

/** Los renglones de una tienda que están en la misma categoría de ella. */
export interface QuoteSection {
  /** Nombre de la categoría tal cual la usa la tienda; `null` si no tiene. */
  category: string | null;
  items: QuoteItem[];
}

export interface QuoteStoreGroup {
  store: string;
  storeSlug: string;
  items: QuoteItem[];
  /**
   * Los mismos renglones agrupados por la categoría de la tienda, en el orden
   * en que aparecen en el carrito. Es lo que convierte la lista en un
   * recorrido: en la tienda se camina por pasillos, no por orden de carga.
   */
  sections: QuoteSection[];
  subtotal: MoneyByCurrency;
  /** Unidades a comprar en esta tienda (suma de cantidades). */
  units: number;
}

export interface Quote {
  groups: QuoteStoreGroup[];
  total: MoneyByCurrency;
  /** Lo que se ahorra aplicando todas las sugerencias. */
  savings: MoneyByCurrency;
  /** Reemplazos que harían falta para aplicar todas las sugerencias. */
  swaps: Array<{ fromId: string; offer: QuoteOffer }>;
  lineCount: number;
  units: number;
  storeCount: number;
  unavailableCount: number;
  /** Renglones con un precio distinto al del día en que se agregaron. */
  changedCount: number;
}

const UNAVAILABLE = new Set(["out_of_stock", "discontinued"]);

/** La oferta "como se guardó": lo que hay cuando el servidor no responde. */
export function offerFromLine(line: CartLine): QuoteOffer {
  const { product } = line;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    store: product.store,
    storeSlug: product.storeSlug ?? product.store,
    storeCategory: product.storeCategory ?? product.category,
    category: product.category,
    price: product.price,
    listPrice: product.listPrice,
    currency: product.currency,
    url: product.url,
    imageUrl: product.imageUrl,
    availability: product.inStock === false ? "out_of_stock" : "unknown",
    priceSeenAt: line.addedAt,
  };
}

/** El camino inverso: una oferta como producto para guardarla en el carrito. */
export function offerToProduct(offer: QuoteOffer): Product {
  return {
    id: offer.id,
    slug: offer.slug,
    name: offer.name,
    brand: offer.brand,
    description: offer.brand,
    price: offer.price,
    listPrice: offer.listPrice,
    currency: offer.currency,
    store: offer.store,
    storeSlug: offer.storeSlug,
    category: offer.category ?? offer.storeCategory ?? "",
    storeCategory: offer.storeCategory,
    imageUrl: offer.imageUrl,
    url: offer.url,
    inStock: UNAVAILABLE.has(offer.availability) ? false : undefined,
  };
}

function addMoney(target: MoneyByCurrency, currency: string, amount: number): void {
  target[currency] = (target[currency] ?? 0) + amount;
}

/** Redondea a centavos para que las sumas no arrastren basura de coma flotante. */
function cents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function pickBetter(
  offer: QuoteOffer,
  unavailable: boolean,
  alternatives: QuoteOffer[],
): QuoteOffer | undefined {
  const sameCurrency = alternatives.filter(
    (candidate) => candidate.currency === offer.currency && !UNAVAILABLE.has(candidate.availability),
  );
  if (unavailable) return sameCurrency[0];
  const cheapest = sameCurrency.reduce<QuoteOffer | undefined>(
    (best, candidate) => (best === undefined || candidate.price < best.price ? candidate : best),
    undefined,
  );
  return cheapest && cheapest.price < offer.price ? cheapest : undefined;
}

export function buildQuote(
  lines: CartLine[],
  results: Map<string, QuoteLineResult> | null,
): Quote {
  const groupsBySlug = new Map<string, QuoteStoreGroup>();
  const total: MoneyByCurrency = {};
  const savings: MoneyByCurrency = {};
  const swaps: Quote["swaps"] = [];
  let units = 0;
  let unavailableCount = 0;
  let changedCount = 0;

  for (const line of lines) {
    const result = results?.get(line.product.id);
    // El servidor devuelve una entrada por cada id pedido: `offer: null`
    // significa que el artículo dejó de estar activo. Sin entrada (no hubo
    // respuesta, o el renglón es nuevo y la consulta va en camino) no se sabe
    // nada todavía y se cotiza con lo guardado.
    const fresh = Boolean(result?.offer);
    const offer = result?.offer ?? offerFromLine(line);
    const unavailable = result
      ? !result.offer || UNAVAILABLE.has(offer.availability)
      : line.product.inStock === false;

    const priceDelta = fresh ? cents(offer.price - line.product.price) : 0;
    if (priceDelta !== 0) changedCount += 1;

    const subtotal = cents(offer.price * line.quantity);
    const better = pickBetter(offer, unavailable, result?.alternatives ?? []);
    const itemSavings =
      better && !unavailable ? cents((offer.price - better.price) * line.quantity) : 0;

    if (better) swaps.push({ fromId: line.product.id, offer: better });
    if (itemSavings > 0) addMoney(savings, offer.currency, itemSavings);

    const item: QuoteItem = {
      line,
      offer,
      fresh,
      unavailable,
      priceDelta,
      subtotal,
      better,
      savings: itemSavings,
    };

    let group = groupsBySlug.get(offer.storeSlug);
    if (!group) {
      group = {
        store: offer.store,
        storeSlug: offer.storeSlug,
        items: [],
        sections: [],
        subtotal: {},
        units: 0,
      };
      groupsBySlug.set(offer.storeSlug, group);
    }
    group.items.push(item);
    const category = offer.storeCategory?.trim() || null;
    const section = group.sections.find((candidate) => candidate.category === category);
    if (section) section.items.push(item);
    else group.sections.push({ category, items: [item] });

    if (unavailable) {
      unavailableCount += 1;
      continue;
    }

    // Lo que no se puede comprar no suma: el total es lo que se va a pagar.
    addMoney(group.subtotal, offer.currency, subtotal);
    addMoney(total, offer.currency, subtotal);
    group.units += line.quantity;
    units += line.quantity;
  }

  for (const money of [total, savings, ...[...groupsBySlug.values()].map((g) => g.subtotal)]) {
    for (const currency of Object.keys(money)) money[currency] = cents(money[currency]);
  }

  // La tienda con más renglones primero: es la parada principal del recorrido.
  const groups = [...groupsBySlug.values()].sort(
    (a, b) => b.items.length - a.items.length || a.store.localeCompare(b.store),
  );

  // Lo que la tienda no categorizó va al final de su parada.
  for (const group of groups) {
    group.sections.sort((a, b) => Number(a.category === null) - Number(b.category === null));
  }

  return {
    groups,
    total,
    savings,
    swaps,
    lineCount: lines.length,
    units,
    storeCount: groups.length,
    unavailableCount,
    changedCount,
  };
}

/**
 * Número de cotización legible y estable: el mismo carrito el mismo día da el
 * mismo número, así dos impresiones de la misma lista se reconocen.
 */
export function quoteNumber(lines: CartLine[], date: Date): string {
  let hash = 2166136261;
  for (const line of lines) {
    const key = `${line.product.id}:${line.quantity}`;
    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  const day = date.toISOString().slice(2, 10).replaceAll("-", "");
  const suffix = (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-4);
  return `FYP-${day}-${suffix}`;
}
