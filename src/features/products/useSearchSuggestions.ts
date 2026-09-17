"use client";

import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";

/** Una entrada del desplegable: qué es y a qué apunta. */
export type Suggestion =
  | { kind: "store"; name: string }
  | { kind: "category"; slug: string; name: string }
  | { kind: "item"; name: string };

export interface SuggestionGroups {
  stores: Suggestion[];
  categories: Suggestion[];
  items: Suggestion[];
}

const EMPTY: SuggestionGroups = { stores: [], categories: [], items: [] };

/** Con menos letras el servidor no sugiere nada; no vale la pena preguntar. */
const MIN_QUERY_LENGTH = 2;

/** Menos que la búsqueda (260ms): las sugerencias tienen que sentirse en vivo. */
const SUGGEST_DEBOUNCE_MS = 150;

interface SuggestResponse {
  ok: boolean;
  stores?: { name: string }[];
  categories?: { slug: string; name: string }[];
  items?: { name: string }[];
}

/**
 * Sugerencias para lo que se está escribiendo.
 *
 * Pide a `/api/products/suggest` con un pequeño retraso y cancela la
 * petición anterior si llega otra tecla: sin `AbortController`, una respuesta
 * lenta para "ipho" podía llegar después de la rápida para "iphone" y pisar
 * el desplegable con sugerencias viejas.
 *
 * Con `enabled` en falso no consulta nunca: es lo que usa la caja de
 * búsqueda en las pruebas y en los sitios donde no hay catálogo remoto.
 */
export function useSearchSuggestions(query: string, enabled: boolean): SuggestionGroups {
  // Lo último que respondió el servidor, junto con la consulta que lo
  // produjo: es lo que permite saber si sirve para lo que hay escrito ahora.
  const [result, setResult] = useState<{ query: string; groups: SuggestionGroups } | null>(null);
  const debounced = useDebounce(query.trim(), SUGGEST_DEBOUNCE_MS);
  const shouldAsk = enabled && debounced.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!shouldAsk) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ q: debounced });

    fetch(`/api/products/suggest?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<SuggestResponse>) : null))
      .then((payload) => {
        if (!payload?.ok) return;
        setResult({
          query: debounced,
          groups: {
            stores: (payload.stores ?? []).map((store) => ({ kind: "store", name: store.name })),
            categories: (payload.categories ?? []).map((category) => ({
              kind: "category",
              slug: category.slug,
              name: category.name,
            })),
            items: (payload.items ?? []).map((item) => ({ kind: "item", name: item.name })),
          },
        });
      })
      .catch(() => {
        // Cancelada o caída: se conserva lo último que se mostró. Un
        // desplegable que parpadea a vacío en cada tecla es peor que uno
        // que va una tecla atrasado.
      });

    return () => controller.abort();
  }, [debounced, shouldAsk]);

  // Sin nada que preguntar (caja corta o vacía) la lista es vacía, se haya
  // respondido lo que se haya respondido antes. Mientras se espera una
  // respuesta nueva se sigue mostrando la anterior: ver el catch de arriba.
  if (!shouldAsk || result === null) return EMPTY;
  return result.groups;
}

/** Las tres listas en el orden del desplegable, para recorrerlas con flechas. */
export function flattenSuggestions(groups: SuggestionGroups): Suggestion[] {
  return [...groups.stores, ...groups.categories, ...groups.items];
}
