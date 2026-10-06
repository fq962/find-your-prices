import type { Product } from "@/types";

/**
 * Tipos del carrito y de la cotización.
 *
 * Viven acá y no en `server/` porque los comparten las dos puntas: el servicio
 * que arma las ofertas y la vista que las pinta. Nada de este archivo toca el
 * servidor, así que importarlo desde un componente cliente es seguro.
 */

/** Un renglón del carrito: qué producto, cuántos y desde cuándo. */
export interface CartLine {
  /**
   * El producto entero, igual que en favoritos: la cotización tiene que poder
   * pintarse aunque la base no responda. Es una foto del momento en que se
   * agregó; los datos vigentes llegan de `/api/quote`.
   */
  product: Product;
  quantity: number;
  /** ISO. Es la fecha del precio cuando no hay dato fresco de la tienda. */
  addedAt: string;
}

/** Disponibilidad tal cual la guarda la base, sin traducir. */
export type QuoteAvailability =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "backorder"
  | "limited"
  | "discontinued"
  | "unknown";

/** Una oferta vigente: un artículo en una tienda, con su precio de hoy. */
export interface QuoteOffer {
  id: string;
  slug?: string;
  name: string;
  brand?: string;
  store: string;
  storeSlug: string;
  /** Categoría con el nombre que le pone la tienda. */
  storeCategory?: string;
  /** Categoría canónica del sitio, si el mapeo existe. */
  category?: string;
  price: number;
  listPrice?: number;
  currency: string;
  url?: string;
  imageUrl?: string;
  availability: QuoteAvailability;
  /** Última vez que el rastreador vio este precio en la tienda. */
  priceSeenAt: string;
  /** Desde cuándo el precio no se mueve, si alguna vez cambió. */
  priceSince?: string;
  gtin?: string;
}

/** Lo que devuelve el servidor por cada renglón del carrito. */
export interface QuoteLineResult {
  id: string;
  /** `null` si el artículo ya no está activo en la tienda. */
  offer: QuoteOffer | null;
  /**
   * El mismo artículo (mismo código de barras) en OTRAS tiendas, del más
   * barato al más caro, uno por tienda. Vacío si no hay código o no hay
   * coincidencias.
   */
  alternatives: QuoteOffer[];
}

export interface QuoteResponse {
  lines: QuoteLineResult[];
  /** ISO del momento en que se consultó. */
  checkedAt: string;
}
