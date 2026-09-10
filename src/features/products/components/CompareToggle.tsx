"use client";

import type { MouseEvent } from "react";
import { useCompareTray } from "@/features/products/useCompareTray";
import type { Product } from "@/types";

/**
 * Apartar un producto para compararlo.
 *
 * Es un interruptor, no una acción de un solo sentido: el mismo control que
 * agrega es el que quita, y su estado se ve sin abrir nada. Por eso lleva
 * `aria-pressed` y cambia de glifo (+ / ✓) además de color — el color solo no
 * basta para quien no lo distingue.
 *
 * No usa `useLocale`: los textos llegan por prop, igual que en `ProductCard`.
 * Así estos controles siguen montándose en pruebas de componente sin envolver
 * el árbol en un proveedor de idioma.
 */

export interface CompareToggleLabels {
  add: string;
  remove: string;
  /** Se muestra cuando la bandeja ya está llena y el control no responde. */
  full: string;
}

export const DEFAULT_COMPARE_TOGGLE_LABELS: CompareToggleLabels = {
  add: "Add to comparison",
  remove: "Remove from comparison",
  full: "Comparison is full",
};

export interface CompareToggleProps {
  product: Product;
  labels?: CompareToggleLabels;
  /**
   * `md` (32px) es el tamaño normal; `sm` (28px) es para las filas densas de la
   * comparación por tienda, donde 32px empujaría el nombre a una línea menos.
   * Ambos quedan por debajo del mínimo táctil de 44px, así que el control lleva
   * área de toque extra con `before` en vez de crecer visualmente.
   */
  size?: "sm" | "md";
  /** Posicionamiento; el tamaño y los colores los pone el propio control. */
  className?: string;
}

export function CompareToggle({
  product,
  labels = DEFAULT_COMPARE_TOGGLE_LABELS,
  size = "md",
  className = "",
}: CompareToggleProps) {
  const { contains, isFull, toggle } = useCompareTray();

  const isSelected = contains(product.id);
  // Lleno y sin estar dentro: no hay nada que este botón pueda hacer. Se
  // deshabilita en vez de dejar que el clic no haga nada en silencio.
  const isBlocked = isFull && !isSelected;
  const label = isSelected
    ? labels.remove
    : isBlocked
      ? labels.full
      : labels.add;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Estos controles viven dentro de tarjetas que son enlaces: sin esto, el
    // clic apartaría el producto y además navegaría a la ficha.
    event.preventDefault();
    event.stopPropagation();
    toggle(product);
  }

  return (
    /* El posicionamiento que pide quien lo usa va en este envoltorio y no en el
       botón. El botón necesita `position: relative` para su área de toque
       (`before`), y esa clase y un `absolute` que llegara por prop entrarían en
       conflicto: son la misma propiedad, y cuál gana lo decide el orden del CSS
       generado, no el orden del string. Separarlos elimina la ambigüedad. */
    <span className={`inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isBlocked}
        aria-pressed={isSelected}
        aria-label={`${label}: ${product.name}`}
        title={label}
        className={`relative flex items-center justify-center rounded-full border outline-none before:absolute before:-inset-2 before:content-[''] ${
          size === "sm" ? "h-7 w-7" : "h-8 w-8"
        } transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 ${
          isSelected
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
            : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isSelected ? (
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          ) : (
            <path d="M12 5v14M5 12h14" />
          )}
        </svg>
      </button>
    </span>
  );
}
