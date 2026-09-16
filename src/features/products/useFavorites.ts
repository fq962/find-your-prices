"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Product } from "@/types";
import {
  getFavoritesServerSnapshot,
  getFavoritesSnapshot,
  isFavorite,
  removeFavorite,
  subscribeToFavorites,
  toggleFavorite,
  writeFavorites,
} from "./favorites";

/**
 * Acceso de React a los favoritos.
 *
 * Igual que `useCompareTray`: el corazón de cada tarjeta, el contador de la
 * barra de navegación y la página de favoritos no tienen ningún ancestro
 * común cerca, así que el estado vive fuera de React y se lee con
 * `useSyncExternalStore`.
 */
export interface FavoritesApi {
  items: Product[];
  count: number;
  contains: (productId: string) => boolean;
  toggle: (product: Product) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export function useFavorites(): FavoritesApi {
  const items = useSyncExternalStore(
    subscribeToFavorites,
    getFavoritesSnapshot,
    getFavoritesServerSnapshot,
  );

  const toggle = useCallback(
    (product: Product) => writeFavorites(toggleFavorite(getFavoritesSnapshot(), product)),
    [],
  );

  const remove = useCallback(
    (productId: string) => writeFavorites(removeFavorite(getFavoritesSnapshot(), productId)),
    [],
  );

  const clear = useCallback(() => writeFavorites([]), []);

  const contains = useCallback((productId: string) => isFavorite(items, productId), [items]);

  return { items, count: items.length, contains, toggle, remove, clear };
}
