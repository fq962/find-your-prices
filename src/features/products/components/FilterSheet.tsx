"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Los filtros en teléfono: hoja a pantalla completa.
 *
 * La barra lateral fija no cabe en 375px sin robarle al catálogo la mitad del
 * ancho, así que ahí se convierte en esto. Es el patrón de cualquier tienda en
 * móvil, y funciona porque separa los dos momentos: primero decidís qué
 * filtrar, con toda la pantalla; después mirás los resultados, con toda la
 * pantalla.
 *
 * El pie con "Ver resultados" no es decorativo: sin él, la persona filtra y se
 * queda mirando una lista de filtros sin saber cómo volver a los productos. Y
 * lleva la cuenta, que es lo que hace que ese botón sea una decisión informada
 * —"ver 340 resultados" dice si vale la pena volver o seguir filtrando.
 */

export interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  onClear: () => void;
  /** Cuántos resultados quedan con lo que hay marcado ahora mismo. */
  resultCountLabel: string;
  hasActiveFilters: boolean;
  labels: {
    title: string;
    close: string;
    clear: string;
    seeResults: string;
  };
  children: ReactNode;
}

export function FilterSheet({
  open,
  onClose,
  onClear,
  resultCountLabel,
  hasActiveFilters,
  labels,
  children,
}: FilterSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /**
   * Mientras la hoja está abierta, el fondo no se desplaza.
   *
   * Sin esto, arrastrar dentro de la hoja mueve el catálogo que hay detrás y al
   * cerrar aparecés en otro punto de la lista, sin haber pedido moverte.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /** Escape cierra, y el foco entra a la hoja al abrirse. */
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      // Encierro del foco. Sin esto, tabular se escapa al catálogo que hay
      // detrás —invisible bajo la hoja—, y quien navega con teclado se queda
      // moviéndose por controles que no puede ver.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      className="fixed inset-0 z-50 lg:hidden"
    >
      <button
        type="button"
        aria-label={labels.close}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        style={{ animation: "fyp-fade 200ms var(--ease-out-quart) both" }}
      />

      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 top-10 flex flex-col rounded-t-3xl border-t border-[var(--border)] bg-[var(--bg-elevated)]"
        style={{ animation: "fyp-rise 320ms var(--ease-out-expo) both" }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[1rem] font-semibold text-[var(--text)]">{labels.title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            >
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* El relleno inferior es por el pie fijo: sin él, el último control
            queda debajo del botón y el anillo de foco se ve a medias, que es
            justo lo que WCAG llama foco obstruido. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          {children}
        </div>

        <footer
          className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onClear}
            disabled={!hasActiveFilters}
            className="h-12 flex-1 rounded-xl border border-[var(--border)] text-[0.9375rem] font-medium text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-40"
          >
            {labels.clear}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-[1.4] rounded-xl bg-[var(--accent)] text-[0.9375rem] font-semibold text-[var(--accent-contrast)] outline-none transition-opacity duration-[var(--dur-fast)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]"
          >
            {labels.seeResults}
            <span className="ml-1.5 font-normal opacity-80 tabular-nums">{resultCountLabel}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
