"use client";

import { useId, type ReactNode } from "react";

/**
 * Una sección plegable del panel de filtros.
 *
 * El patrón —título, signo de más/menos, contenido que se despliega— viene del
 * panel lateral de un comparador de precios grande, y funciona por una razón
 * concreta: con cinco facetas abiertas a la vez la barra lateral mide tres
 * pantallas de alto y nadie encuentra nada. Plegadas, las cinco caben de un
 * vistazo y la persona abre la que le interesa.
 *
 * Es un botón con `aria-expanded` y no un `<details>` porque el resumen de
 * `<details>` lleva su propio triángulo, no se puede quitar de forma fiable en
 * todos los navegadores, y su estado abierto/cerrado no se puede controlar
 * desde React sin pelearse con el elemento.
 *
 * El contenido plegado se desmonta en vez de esconderse con CSS: una lista de
 * 300 marcas oculta seguiría en el árbol de accesibilidad y en el orden de
 * tabulación, y tabular por 300 casillas invisibles para llegar al siguiente
 * filtro es peor que no tener el filtro.
 */

export interface FilterSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  /**
   * Resumen de lo elegido, cuando la sección está plegada. Es lo que evita que
   * plegar esconda estado: "Tienda · Walmart Honduras" dice que hay un filtro
   * puesto sin obligar a abrir la sección para comprobarlo.
   */
  summary?: string;
  children: ReactNode;
}

export function FilterSection({ title, open, onToggle, summary, children }: FilterSectionProps) {
  const panelId = useId();

  return (
    <div className="border-b border-[var(--border)]">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 py-4 text-left outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]"
        >
          <span className="min-w-0">
            <span className="block text-[0.9375rem] font-medium text-[var(--text)]">{title}</span>
            {/* El resumen sólo existe plegado: abierto, las opciones marcadas
                ya están a la vista y repetirlo sería ruido. */}
            {!open && summary && (
              <span className="mt-0.5 block truncate text-[0.8125rem] text-[var(--accent)]">
                {summary}
              </span>
            )}
          </span>

          {/* Más/menos en vez de chevron: es el signo del panel de referencia y
              dice "esto agrega opciones" con menos ambigüedad que una flecha,
              que en una barra lateral se confunde con "ir a". */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M5 12h14" />
            <path
              d="M12 5v14"
              className="origin-center transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]"
              style={{ transform: open ? "scaleY(0)" : "scaleY(1)" }}
            />
          </svg>
        </button>
      </h3>

      {open && (
        <div
          id={panelId}
          className="pb-4"
          style={{ animation: "fyp-rise 320ms var(--ease-out-expo) both" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
