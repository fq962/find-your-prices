"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/features/i18n/translate";

export interface ScopeCategory {
  slug: string;
  name: string;
  children: { slug: string; name: string }[];
}

export interface ScopeOptions {
  store: { slug: string; name: string } | null;
  categories: ScopeCategory[];
}

interface ScopeResponse extends Partial<ScopeOptions> {
  ok: boolean;
}

/**
 * Una respuesta por alcance y por idioma durante toda la visita: el árbol
 * cambia con el scraping, no entre una página y la siguiente, y la barra se
 * vuelve a montar en cada navegación.
 */
const cache = new Map<string, Promise<ScopeOptions | null>>();

function loadScope(store: string | null, locale: Locale): Promise<ScopeOptions | null> {
  const key = `${locale}:${store ?? ""}`;
  let pending = cache.get(key);
  if (!pending) {
    const params = new URLSearchParams({ locale });
    if (store) params.set("store", store);
    pending = fetch(`/api/products/scope?${params}`)
      .then((response) => (response.ok ? (response.json() as Promise<ScopeResponse>) : null))
      .then((payload) =>
        payload?.ok ? { store: payload.store ?? null, categories: payload.categories ?? [] } : null,
      )
      .catch(() => null);
    // Un fallo no se queda en caché: la próxima página lo vuelve a intentar.
    pending.then((result) => {
      if (result === null) cache.delete(key);
    });
    cache.set(key, pending);
  }
  return pending;
}

/**
 * Las categorías del selector del buscador: las del catálogo entero y, en
 * una landing de tienda, también las de esa tienda. Mientras llegan (o si la
 * API falla) las listas quedan vacías y el selector ofrece solo "Todas".
 */
export function useSearchScope(
  store: string | null,
  locale: Locale,
): { global: ScopeCategory[]; store: ScopeOptions | null } {
  const [result, setResult] = useState<{
    key: string;
    global: ScopeCategory[];
    store: ScopeOptions | null;
  } | null>(null);
  const key = `${locale}:${store ?? ""}`;

  useEffect(() => {
    let alive = true;
    Promise.all([loadScope(null, locale), store ? loadScope(store, locale) : null]).then(
      ([global, scoped]) => {
        if (!alive) return;
        setResult({ key, global: global?.categories ?? [], store: scoped });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, store, locale]);

  if (result === null || result.key !== key) return { global: result?.global ?? [], store: null };
  return { global: result.global, store: result.store };
}
