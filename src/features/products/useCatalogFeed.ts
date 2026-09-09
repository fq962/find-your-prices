"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/types";
import { CATALOG_PAGE_SIZE } from "./catalogPaging";

/**
 * El listado del catálogo y su desplazamiento infinito.
 *
 * Reemplaza al botón "Ver más", que estaba roto por dos motivos que conviene
 * dejar escritos para no repetirlos:
 *
 *   1. La lista sólo miraba los resultados del servidor cuando había filtros
 *      activos. En la portada, sin filtros, el botón pedía la página siguiente,
 *      la guardaba, y nadie la leía nunca. Parecía que no hacía nada porque
 *      efectivamente no hacía nada.
 *   2. El desplazamiento se calculaba multiplicando por un tamaño de página que
 *      no era el que había usado el servidor para el primer lote, así que la
 *      segunda página empezaba después de donde terminaba la primera y se
 *      perdían artículos en medio.
 *
 * Acá el desplazamiento sale de cuántos artículos hay realmente en pantalla, no
 * de un contador de páginas. Es imposible que se desincronice.
 *
 * Todo el estado vive en un solo objeto que carga consigo la consulta que lo
 * produjo. Esa clave es lo que permite saber si lo que se ve corresponde a los
 * filtros actuales o quedó viejo, sin una segunda bandera que se pueda
 * desincronizar, y sin escribir estado desde el cuerpo de un efecto.
 */

/** Espera antes de consultar: evita una petición por cada tecla. */
const SEARCH_DEBOUNCE_MS = 260;

/**
 * Cuánto antes del final se pide la página siguiente. 800px es algo más de una
 * pantalla de teléfono: la lista crece antes de que el visitante llegue al
 * borde, así que nunca ve el vacío ni el salto.
 */
const PREFETCH_MARGIN = "800px 0px";

/**
 * Cuántas páginas se cargan solas antes de devolver el control.
 *
 * El scroll infinito sin freno tiene dos costes que no se ven hasta que ya
 * duelen: el documento no termina nunca —y con él se va el pie de página, que
 * es donde viven los enlaces legales— y el DOM crece sin techo, con una imagen
 * por ficha, en un teléfono con datos móviles que es donde ocurre la mayoría de
 * las visitas.
 *
 * Cuatro tandas sobre el lote inicial son ~240 artículos. Quien llegó buscando
 * una licuadora nunca ve el freno; quien está paseando pulsa una vez y arranca
 * otra tanda automática. Nadie queda encerrado en una página sin fondo.
 */
const AUTO_PAGES_PER_RUN = 0;

export type CatalogFeedStatus = "idle" | "searching" | "loadingMore" | "error";

interface FeedSnapshot {
  /** Consulta que produjo estos datos. */
  key: string;
  products: Product[];
  /** Total que cumple los filtros, no lo que se lleva cargado. */
  total: number;
}

export interface UseCatalogFeedOptions {
  /**
   * Con `false` no hay API detrás: el catálogo es el que ya está en memoria y
   * no hay paginación que hacer (fixture y pruebas).
   */
  enabled: boolean;
  /** Filtros, orden e idioma ya serializados. Sin `limit` ni `offset`. */
  queryString: string;
  /**
   * `true` cuando `queryString` es exactamente la consulta que el servidor ya
   * resolvió al pintar la página. En ese caso el primer lote NO se vuelve a
   * pedir: ya está en el HTML.
   */
  isDefaultQuery: boolean;
  /** Primer lote servido por la ruta. */
  initialProducts: Product[];
  initialTotal: number;
}

export interface CatalogFeed {
  products: Product[];
  total: number;
  /** Hay una primera página en vuelo para una consulta nueva. */
  isSearching: boolean;
  /** Hay una página siguiente en vuelo. */
  isLoadingMore: boolean;
  /** Falló la última petición; `loadMore` la repite. */
  hasError: boolean;
  /** Quedan artículos por traer. */
  hasMore: boolean;
  /**
   * La carga automática se agotó y espera un clic. Sirve para explicar por qué
   * la lista dejó de crecer sola, en vez de que parezca que se rompió.
   */
  isAutoPaused: boolean;
  /** Se le pone al elemento centinela del final de la lista. */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  /** Trae más: la página siguiente, o la primera si la primera falló. */
  loadMore: () => void;
}

export function useCatalogFeed({
  enabled,
  queryString,
  isDefaultQuery,
  initialProducts,
  initialTotal,
}: UseCatalogFeedOptions): CatalogFeed {
  const [snapshot, setSnapshot] = useState<FeedSnapshot | null>(null);
  const [status, setStatus] = useState<CatalogFeedStatus>("idle");
  /** Se incrementa para repetir la primera página tras un fallo. */
  const [retryToken, setRetryToken] = useState(0);
  /**
   * Cuántas páginas se han cargado solas en la tanda actual. Va con la clave de
   * la consulta pegada para que cambiar de filtros reinicie la cuenta sin tener
   * que escribir estado desde un efecto.
   */
  const [autoRun, setAutoRun] = useState<{ key: string; count: number }>({ key: "", count: 0 });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Descarta respuestas de consultas ya superadas: sin esto, una petición lenta
  // puede llegar después de otra más nueva y pisar resultados correctos.
  const requestSeq = useRef(0);

  // ---------------------------------------------------------------------------
  // Qué se ve, derivado del estado y de la consulta actual
  // ---------------------------------------------------------------------------

  const current = snapshot?.key === queryString ? snapshot : null;

  /**
   * Sin datos propios para esta consulta hay dos salidas, y el orden importa:
   *
   *   - Si la consulta es la que el servidor ya resolvió, el lote inicial ES la
   *     respuesta correcta y aparece al instante. Es lo que hace que limpiar
   *     los filtros devuelva el catálogo sin esperar a ninguna petición.
   *   - Si no, se siguen mostrando los resultados anteriores mientras llega lo
   *     nuevo. Vaciar la lista en cada tecla haría parpadear la pantalla entre
   *     resultados y vacío.
   */
  const settled: FeedSnapshot | null = useMemo(
    () =>
      current ??
      (isDefaultQuery
        ? { key: queryString, products: initialProducts, total: initialTotal }
        : null),
    [current, isDefaultQuery, queryString, initialProducts, initialTotal],
  );

  const visible = settled ?? snapshot;

  const products = visible?.products ?? [];
  const total = visible?.total ?? 0;

  // Sólo se puede pedir más de algo que ya está resuelto: encadenar páginas
  // sobre resultados viejos mezclaría dos consultas en una sola lista.
  const hasMore = enabled && settled !== null && settled.products.length < settled.total;

  const autoLoads = autoRun.key === queryString ? autoRun.count : 0;
  /** La carga automática se agotó; de acá en adelante manda el botón. */
  const isAutoPaused = autoLoads >= AUTO_PAGES_PER_RUN;

  // ---------------------------------------------------------------------------
  // Primera página de una consulta nueva
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled || isDefaultQuery) return;

    const seq = ++requestSeq.current;

    const timer = setTimeout(async () => {
      setStatus("searching");
      try {
        const params = new URLSearchParams(queryString);
        params.set("limit", String(CATALOG_PAGE_SIZE));
        const response = await fetch(`/api/products/search?${params}`);
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json();
        if (seq !== requestSeq.current) return;

        setSnapshot({
          key: queryString,
          products: Array.isArray(payload.products) ? payload.products : [],
          total: typeof payload.total === "number" ? payload.total : 0,
        });
        setStatus("idle");
      } catch {
        if (seq !== requestSeq.current) return;
        // No se toca `snapshot`: lo que haya en pantalla sigue siendo lo último
        // bueno que se pudo mostrar, y el error se cuenta aparte.
        setStatus("error");
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [enabled, queryString, isDefaultQuery, retryToken]);

  // ---------------------------------------------------------------------------
  // Página siguiente
  // ---------------------------------------------------------------------------

  const fetchNextPage = useCallback(
    async (source: "auto" | "manual") => {
      if (!enabled || settled === null) return;
      if (status === "searching" || status === "loadingMore") return;
      if (settled.products.length >= settled.total) return;

      const key = settled.key;
      const seq = ++requestSeq.current;
      setStatus("loadingMore");

      // Un clic devuelve el presupuesto de carga automática a cero: quien pide
      // más a mano está diciendo que quiere seguir, no que quiere una página.
      setAutoRun((run) =>
        source === "manual"
          ? { key, count: 0 }
          : { key, count: (run.key === key ? run.count : 0) + 1 },
      );

      try {
        const params = new URLSearchParams(key);
        params.set("limit", String(CATALOG_PAGE_SIZE));
        // El desplazamiento es cuántos artículos hay, no cuántas páginas van:
        // así no depende de que el servidor y el cliente usen el mismo tamaño.
        params.set("offset", String(settled.products.length));

        const response = await fetch(`/api/products/search?${params}`);
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json();
        if (seq !== requestSeq.current) return;

        const incoming: Product[] = Array.isArray(payload.products) ? payload.products : [];

        setSnapshot((previous) => {
          const base = previous?.key === key ? previous.products : settled.products;
          // Un id repetido significa que el catálogo cambió entre páginas (entró
          // un artículo nuevo y corrió a los demás). Se descarta el duplicado en
          // vez de pintarlo dos veces con la misma clave de React.
          const seen = new Set(base.map((product) => product.id));
          return {
            key,
            products: [...base, ...incoming.filter((product) => !seen.has(product.id))],
            total: typeof payload.total === "number" ? payload.total : settled.total,
          };
        });
        setStatus("idle");
      } catch {
        if (seq !== requestSeq.current) return;
        setStatus("error");
      }
    },
    [enabled, settled, status],
  );

  /**
   * Una sola puerta para "traeme más", venga del desplazamiento, del botón o de
   * un reintento tras un fallo. Sin datos asentados para esta consulta lo que
   * falló fue la primera página, así que lo que hay que repetir es la búsqueda,
   * no la página siguiente de algo que nunca llegó.
   */
  const loadMore = useCallback(() => {
    if (settled === null) {
      setStatus("idle");
      setRetryToken((token) => token + 1);
      return;
    }
    void fetchNextPage("manual");
  }, [settled, fetchNextPage]);

  // ---------------------------------------------------------------------------
  // Desplazamiento infinito
  // ---------------------------------------------------------------------------

  const canObserve = hasMore && status === "idle" && !isAutoPaused;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !canObserve) return;

    // Tras un error el observador no se vuelve a montar: reintentar es una
    // decisión de quien mira, no algo que deba repetirse solo contra un
    // servidor que acaba de fallar.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage("auto");
      },
      { rootMargin: PREFETCH_MARGIN },
    );

    observer.observe(node);
    return () => observer.disconnect();
    // `products.length` entra a propósito: al crecer la lista el centinela se
    // desplaza y hay que volver a observarlo en su nueva posición.
  }, [canObserve, products.length, fetchNextPage]);

  return {
    products,
    total,
    isSearching: status === "searching",
    isLoadingMore: status === "loadingMore",
    hasError: status === "error",
    hasMore,
    isAutoPaused,
    sentinelRef,
    loadMore,
  };
}
