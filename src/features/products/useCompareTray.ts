"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Product } from "@/types";
import {
  getCompareTraySnapshot,
  getCompareTrayServerSnapshot,
  isInTray,
  isTrayFull,
  removeFromTray,
  subscribeToCompareTray,
  toggleInTray,
  writeCompareTray,
} from "./compareTray";

/**
 * Acceso de React a la bandeja de comparación.
 *
 * La bandeja es estado externo y compartido: la tocan la ficha de la lista, la
 * de la cuadrícula y la barra de abajo, que no tienen ningún ancestro común
 * cerca. `useSyncExternalStore` evita tener que subir ese estado hasta la raíz
 * y volver a bajarlo por props a cada tarjeta.
 */
export interface CompareTrayApi {
  items: Product[];
  count: number;
  isFull: boolean;
  contains: (productId: string) => boolean;
  toggle: (product: Product) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export function useCompareTray(): CompareTrayApi {
  const items = useSyncExternalStore(
    subscribeToCompareTray,
    getCompareTraySnapshot,
    getCompareTrayServerSnapshot,
  );

  const toggle = useCallback(
    (product: Product) => writeCompareTray(toggleInTray(getCompareTraySnapshot(), product)),
    [],
  );

  const remove = useCallback(
    (productId: string) => writeCompareTray(removeFromTray(getCompareTraySnapshot(), productId)),
    [],
  );

  const clear = useCallback(() => writeCompareTray([]), []);

  const contains = useCallback((productId: string) => isInTray(items, productId), [items]);

  return {
    items,
    count: items.length,
    isFull: isTrayFull(items),
    contains,
    toggle,
    remove,
    clear,
  };
}
