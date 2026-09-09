"use client";

/**
 * El final de la lista, y el disparador del desplazamiento infinito.
 *
 * Ocupa siempre el mismo alto pase lo que pase. Es lo que evita que la página
 * dé un salto cada vez que una página nueva entra o el mensaje cambia — y con
 * carga automática ese salto ocurriría cada pocos segundos.
 *
 * El botón sigue existiendo aunque la carga sea automática, y no es adorno: el
 * observador de intersección sólo se dispara con el desplazamiento, así que sin
 * botón nadie que navegue con teclado podría pasar del primer lote. Lo mismo
 * vale para quien tenga el observador bloqueado. Con el ratón nunca se ve
 * porque la página siguiente ya llegó antes de acercarse.
 */

export interface CatalogFeedFooterProps {
  /** Se le pone al centinela que observa el hook. */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  /**
   * La lista dejó de crecer sola. El botón pasa a ser la acción principal: es
   * el momento en que alguien lo mira de verdad.
   */
  isAutoPaused: boolean;
  isLoadingMore: boolean;
  hasError: boolean;
  /** Con la lista vacía no se anuncia un final que nunca empezó. */
  hasProducts: boolean;
  /** Trae más: la página siguiente, o un reintento cuando algo falló. */
  onLoadMore: () => void;
  labels: {
    loadingMore: string;
    loadMore: string;
    error: string;
    retry: string;
    allShown: string;
  };
}

export function CatalogFeedFooter({
  sentinelRef,
  hasMore,
  isAutoPaused,
  isLoadingMore,
  hasError,
  hasProducts,
  onLoadMore,
  labels,
}: CatalogFeedFooterProps) {
  return (
    <div
      ref={sentinelRef}
      className="flex min-h-20 flex-col items-center justify-center gap-3 py-4"
    >
      {/* `aria-live` acá y no en cada mensaje: el lector de pantalla anuncia el
          cambio de estado sin que haya que mover el foco a ningún lado. */}
      <p aria-live="polite" className="sr-only">
        {hasError ? labels.error : isLoadingMore ? labels.loadingMore : ""}
      </p>

      {hasError && (
        <div className="flex flex-col items-center gap-2.5">
          <p className="text-[0.875rem] text-[var(--text-secondary)]">{labels.error}</p>
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-[var(--border-strong)] px-5 py-2 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-[background-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:bg-[var(--bg-subtle)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            {labels.retry}
          </button>
        </div>
      )}

      {!hasError && isLoadingMore && (
        <span
          aria-hidden="true"
          className="flex items-center gap-1.5 text-[var(--text-tertiary)]"
        >
          {/* Tres puntos que laten desfasados. Es lo único que se mueve en la
              página mientras carga, así que basta con que respire. */}
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-1.5 w-1.5 rounded-full bg-current"
              style={{
                animation: "fyp-pulse 1.1s var(--ease-in-out-expo) infinite",
                animationDelay: `${index * 140}ms`,
              }}
            />
          ))}
        </span>
      )}

      {!hasError && !isLoadingMore && hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className={`rounded-full px-5 py-2.5 text-[0.875rem] font-medium outline-none transition-[background-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] ${
            isAutoPaused
              ? "bg-[var(--text)] text-[var(--text-inverted)] hover:scale-[1.03]"
              : "border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-subtle)]"
          }`}
        >
          {labels.loadMore}
        </button>
      )}

      {!hasError && !hasMore && hasProducts && (
        <p className="text-[0.8125rem] text-[var(--text-tertiary)]">{labels.allShown}</p>
      )}
    </div>
  );
}
