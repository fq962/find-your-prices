"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Product } from "@/types";
import {
  addToCart,
  getCartServerSnapshot,
  getCartSnapshot,
  isInCart,
  quantityOf,
  removeFromCart,
  replaceInCart,
  setQuantity,
  subscribeToCart,
  writeCart,
} from "./cart";
import type { CartLine } from "./types";

/**
 * Acceso de React al carrito. Igual que `useFavorites`: el botón de cada
 * tarjeta, el contador de la barra y la página de cotización no comparten un
 * ancestro cercano, así que el estado vive fuera de React.
 */
export interface CartApi {
  lines: CartLine[];
  /** Renglones distintos, no unidades: es lo que muestra el contador. */
  count: number;
  contains: (productId: string) => boolean;
  quantityOf: (productId: string) => number;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  replace: (fromId: string, product: Product) => void;
  /** Varios reemplazos de una vez, con una sola escritura. */
  replaceMany: (swaps: Array<{ fromId: string; product: Product }>) => void;
  clear: () => void;
}

export function useCart(): CartApi {
  const lines = useSyncExternalStore(subscribeToCart, getCartSnapshot, getCartServerSnapshot);

  const add = useCallback(
    (product: Product, quantity = 1) => writeCart(addToCart(getCartSnapshot(), product, quantity)),
    [],
  );
  const setLineQuantity = useCallback(
    (productId: string, quantity: number) =>
      writeCart(setQuantity(getCartSnapshot(), productId, quantity)),
    [],
  );
  const remove = useCallback(
    (productId: string) => writeCart(removeFromCart(getCartSnapshot(), productId)),
    [],
  );
  const replace = useCallback(
    (fromId: string, product: Product) =>
      writeCart(replaceInCart(getCartSnapshot(), fromId, product)),
    [],
  );
  const replaceMany = useCallback(
    (swaps: Array<{ fromId: string; product: Product }>) =>
      writeCart(
        swaps.reduce(
          (current, swap) => replaceInCart(current, swap.fromId, swap.product),
          getCartSnapshot(),
        ),
      ),
    [],
  );
  const clear = useCallback(() => writeCart([]), []);

  const contains = useCallback((productId: string) => isInCart(lines, productId), [lines]);
  const quantity = useCallback((productId: string) => quantityOf(lines, productId), [lines]);

  return {
    lines,
    count: lines.length,
    contains,
    quantityOf: quantity,
    add,
    setQuantity: setLineQuantity,
    remove,
    replace,
    replaceMany,
    clear,
  };
}
