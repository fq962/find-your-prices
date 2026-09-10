"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/types";

/**
 * Resultados por tienda para la vista de comparar.
 *
 * Una columna es una consulta: los mismos filtros del catálogo más `store=X`.
 * Se piden en paralelo y se guardan por tienda, no en una lista plana, porque
 * lo que se compara es "qué tiene cada quien", y mezclarlo en un solo array
 * obligaría a reagrupar en cada render.
 */

export interface ComparisonColumn {
  /** Tienda de la columna. `undefined` mientras nadie ha elegido una. */
  store?: string;
  products: Product[];
  /** Total en esa tienda para los filtros actuales, no sólo lo traído. */
  total: number;
  isLoading: boolean;
}

export interface UseStoreComparisonOptions {
  /** Sólo consulta en modo comparar: fuera de él no se gasta una petición. */
  enabled: boolean;
  /** Tienda elegida en cada columna, en orden. Puede traer huecos. */
  stores: (string | undefined)[];
  /**
   * Query ya armada con búsqueda, filtros y orden, SIN `store` ni `limit`:
   * los pone este hook, uno por columna.
   */
  baseQuery: string;
  /** Con `false` no hay API: se compara sobre lo que ya está en memoria. */
  remoteSearch: boolean;
  /** Catálogo local, para el modo sin API (fixture y pruebas). */
  localProducts: Product[];
  /** Cuántos artículos trae cada columna. */
  limit?: number;
}

/** Filas por columna. Más que esto ya no se compara: se hace scroll. */
export const COMPARE_COLUMN_LIMIT = 12;

interface Snapshot {
  /** Configuración que produjo estos datos: tiendas + filtros + orden. */
  key: string;
  byStore: Record<string, { products: Product[]; total: number }>;
}

const EMPTY_SNAPSHOT: Snapshot = { key: "", byStore: {} };

export function useStoreComparison({
  enabled,
  stores,
  baseQuery,
  remoteSearch,
  localProducts,
  limit = COMPARE_COLUMN_LIMIT,
}: UseStoreComparisonOptions): ComparisonColumn[] {
  /**
   * Un único estado con los datos Y la configuración que los produjo.
   *
   * Guardar la clave junto a los datos es lo que permite deducir "esto está
   * cargando" sin una segunda bandera que haya que encender antes de pedir: si
   * la clave guardada no es la actual, lo que hay en pantalla es viejo. Un
   * `setIsLoading(true)` en el cuerpo del efecto sería un render extra en cada
   * tecla, además de dos fuentes de verdad que se pueden desincronizar.
   */
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);

  // Las tiendas llegan en un array nuevo en cada render; esto es lo que se
  // compara de verdad para decidir si hay que volver a consultar. Se serializan
  // con un separador que ningún nombre de tienda puede contener.
  const selectedKey = [...new Set(stores.filter((store): store is string => Boolean(store)))]
    .sort()
    .join("\u0000");

  /** Identidad completa de lo que hay en pantalla: filtros + tiendas. */
  const key = `${baseQuery}\u0001${selectedKey}`;

  // Descarta respuestas de configuraciones ya superadas: cambiar de tienda
  // rápido puede dejar en vuelo una petición cuya respuesta ya no corresponde.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!enabled || !remoteSearch) return;

    const wanted = selectedKey === "" ? [] : selectedKey.split("\u0000");
    if (wanted.length === 0) return;

    const seq = ++requestSeq.current;
    let cancelled = false;

    (async () => {
      const settled = await Promise.all(
        wanted.map(async (store) => {
          try {
            const params = new URLSearchParams(baseQuery);
            params.set("store", store);
            params.set("limit", String(limit));
            const response = await fetch(`/api/products/search?${params}`);
            const payload = await response.json();
            return {
              store,
              products: Array.isArray(payload.products) ? (payload.products as Product[]) : [],
              total: typeof payload.total === "number" ? payload.total : 0,
            };
          } catch {
            // Una tienda que falla deja su columna vacía; las demás siguen. Es
            // preferible a tumbar la comparación entera por un error de red.
            return { store, products: [] as Product[], total: 0 };
          }
        }),
      );

      if (cancelled || seq !== requestSeq.current) return;

      setSnapshot({
        key,
        byStore: Object.fromEntries(settled.map(({ store, ...rest }) => [store, rest])),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, key, baseQuery, selectedKey, remoteSearch, limit]);

  const isStale = snapshot.key !== key;

  return stores.map((store) => {
    if (!store) return { store: undefined, products: [], total: 0, isLoading: false };

    if (!remoteSearch) {
      const products = localProducts.filter((product) => product.store === store);
      return { store, products: products.slice(0, limit), total: products.length, isLoading: false };
    }

    const entry = snapshot.byStore[store];
    return {
      store,
      // Mientras llega lo nuevo se sigue mostrando lo anterior de esa misma
      // tienda si existe: al afinar la búsqueda las columnas se actualizan en
      // vez de vaciarse y volver a llenarse.
      products: entry?.products ?? [],
      total: entry?.total ?? 0,
      isLoading: isStale,
    };
  });
}
