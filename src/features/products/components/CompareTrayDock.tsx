"use client";

import { useEffect } from "react";
import { SHELL } from "@/components/layout/shell";
import { MAX_COMPARE_ITEMS } from "@/features/products/compareTray";
import type { Product } from "@/types";

/**
 * Barra fija con lo que hay apartado para comparar.
 *
 * Existe porque la selección se arma mientras se navega: se aparta algo, se
 * sigue bajando, se aparta otra cosa. Sin una barra siempre visible habría que
 * recordar qué se lleva elegido y buscar dónde se abre la comparación.
 *
 * Se ancla abajo y no arriba: arriba ya está la barra de búsqueda pegada, y en
 * teléfono el borde inferior es el que queda al alcance del pulgar. Los huecos
 * vacíos se dibujan a propósito —muestran cuánto cabe todavía— y el interior
 * respeta el área segura del dispositivo para no quedar bajo la barra de
 * gestos.
 */

export interface CompareTrayDockProps {
  items: Product[];
  labels: {
    title: string;
    open: string;
    clear: string;
    remove: string;
    hint: string;
  };
  onOpen: () => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
}

export function CompareTrayDock({
  items,
  labels,
  onOpen,
  onRemove,
  onClear,
}: CompareTrayDockProps) {
  const isVisible = items.length > 0;

  /**
   * Publica el alto de la barra en una custom property.
   *
   * Es la forma más barata de que otros elementos fijos —hoy el botón de volver
   * arriba— se aparten sin que haya que conectarlos por props a través de media
   * página. Quien no la conozca usa su valor por defecto y no se entera.
   */
  useEffect(() => {
    if (!isVisible) return;
    const root = document.documentElement;
    root.style.setProperty("--fyp-dock", "5.25rem");
    return () => {
      root.style.removeProperty("--fyp-dock");
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const emptySlots = Math.max(MAX_COMPARE_ITEMS - items.length, 0);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--glass)] backdrop-blur-xl"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        animation: "fyp-rise 380ms var(--ease-out-expo) both",
      }}
    >
      <div className={`${SHELL} flex items-center gap-3 py-3 sm:gap-4`}>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto sm:gap-3">
          {items.map((product) => (
            <div key={product.id} className="relative shrink-0">
              <div className="h-12 w-12 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] sm:h-14 sm:w-14">
                {product.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-[0.5625rem] leading-tight text-[var(--text-tertiary)]">
                    {product.name.slice(0, 18)}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onRemove(product.id)}
                aria-label={`${labels.remove}: ${product.name}`}
                title={labels.remove}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] shadow-[var(--shadow-sm)] outline-none transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] hover:text-[var(--text)] active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                >
                  <path d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Huecos libres: dicen cuánto más cabe sin tener que contar. Se
              esconden en pantallas angostas, donde el ancho vale más. */}
          {Array.from({ length: emptySlots }).map((_, index) => (
            <div
              key={`slot-${index}`}
              aria-hidden="true"
              className="hidden h-14 w-14 shrink-0 rounded-xl border border-dashed border-[var(--border-strong)] opacity-50 sm:block"
            />
          ))}

          <p className="ml-1 hidden min-w-0 text-[0.8125rem] leading-tight text-[var(--text-secondary)] lg:block">
            <span className="font-medium text-[var(--text)]">{labels.title}</span>
            <br />
            <span className="text-[var(--text-tertiary)]">{labels.hint}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onClear}
            className="rounded-full px-2 py-1.5 text-[0.8125rem] text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {labels.clear}
          </button>

          <button
            type="button"
            onClick={onOpen}
            className="flex h-11 items-center gap-2 rounded-full bg-[var(--text)] px-5 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            {labels.open}
            <span className="rounded-full bg-[var(--text-inverted)]/15 px-1.5 text-[0.75rem] tabular-nums">
              {items.length}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
