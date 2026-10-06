"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuoteLineResult, QuoteResponse } from "./types";

export type QuoteFetchStatus = "loading" | "ready" | "error";

export interface QuoteOffersState {
  /**
   * Respuestas por id. Se conservan las de la consulta anterior mientras llega
   * la nueva: al cambiar un renglón de tienda, el resto no vuelve a "precio
   * guardado" durante el viaje.
   */
  results: Map<string, QuoteLineResult> | null;
  status: QuoteFetchStatus;
  checkedAt: string | null;
  retry: () => void;
}

interface Settled {
  key: string;
  ok: boolean;
  results: Map<string, QuoteLineResult> | null;
  checkedAt: string | null;
}

/**
 * Precios vigentes para los ids del carrito.
 *
 * La consulta depende solo del CONJUNTO de ids, no de las cantidades: subir
 * de 2 a 3 unidades no cambia ningún precio y no debe ir a la red. El estado
 * de carga se deriva comparando la clave pedida con la última resuelta, en
 * vez de guardarse aparte: así no hay un `setState` síncrono en el efecto ni
 * un render en el que los dos digan cosas distintas.
 */
export function useQuoteOffers(ids: string[], enabled = true): QuoteOffersState {
  const key = useMemo(() => [...new Set(ids)].sort().join(","), [ids]);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Reintentar con el mismo carrito también es una consulta nueva: sin el
  // intento en la clave, el estado seguiría en "error" durante el viaje.
  const requestKey = `${key}#${attempt}`;

  useEffect(() => {
    if (!enabled || key === "") return;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: key.split(",") }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as QuoteResponse;
        const results = new Map(body.lines.map((line) => [line.id, line]));
        setSettled((previous) => ({
          key: requestKey,
          ok: true,
          // Se funden con las anteriores: un id que ya no está en el carrito
          // no estorba, y uno que sigue tiene ahora el dato nuevo.
          results: new Map([...(previous?.results ?? []), ...results]),
          checkedAt: body.checkedAt,
        }));
      } catch {
        if (controller.signal.aborted) return;
        setSettled((previous) => ({
          key: requestKey,
          ok: false,
          results: previous?.results ?? null,
          checkedAt: previous?.checkedAt ?? null,
        }));
      }
    })();

    return () => controller.abort();
  }, [key, requestKey, enabled]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (key === "") return { results: null, status: "ready", checkedAt: null, retry };

  const status: QuoteFetchStatus =
    settled?.key !== requestKey ? "loading" : settled.ok ? "ready" : "error";

  return {
    results: settled?.results ?? null,
    status,
    checkedAt: settled?.checkedAt ?? null,
    retry,
  };
}
