"use client";

import { useRef, type MouseEvent } from "react";
import { useFavorites } from "@/features/products/useFavorites";
import type { Product } from "@/types";

/**
 * El corazón: marcar un producto como favorito.
 *
 * Es un interruptor, igual que `CompareToggle`: el mismo control que agrega es
 * el que quita, y su estado se ve sin abrir nada. Lleva `aria-pressed` y
 * cambia de relleno (contorno / lleno) además de color — el color solo no
 * basta para quien no lo distingue.
 *
 * No usa `useLocale`: los textos llegan por prop, igual que en `ProductCard`.
 * Así estos controles siguen montándose en pruebas de componente sin envolver
 * el árbol en un proveedor de idioma.
 */

export interface FavoriteToggleLabels {
  add: string;
  remove: string;
}

export const DEFAULT_FAVORITE_TOGGLE_LABELS: FavoriteToggleLabels = {
  add: "Add to favorites",
  remove: "Remove from favorites",
};

export interface FavoriteToggleProps {
  product: Product;
  labels?: FavoriteToggleLabels;
  /** Mismos tamaños que `CompareToggle`, para que queden alineados lado a lado. */
  size?: "sm" | "md";
  /** Posicionamiento; el tamaño y los colores los pone el propio control. */
  className?: string;
}

export function FavoriteToggle({
  product,
  labels = DEFAULT_FAVORITE_TOGGLE_LABELS,
  size = "md",
  className = "",
}: FavoriteToggleProps) {
  const { contains, toggle } = useFavorites();
  const iconRef = useRef<SVGSVGElement>(null);

  const isSelected = contains(product.id);
  const label = isSelected ? labels.remove : labels.add;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Estos controles viven dentro de tarjetas que son enlaces: sin esto, el
    // clic marcaría el favorito y además navegaría a la ficha.
    event.preventDefault();
    event.stopPropagation();

    // El latido solo al AGREGAR: quitar algo no merece celebración. Se
    // reinicia la animación a mano para que dos clics seguidos latan dos veces.
    if (!isSelected && iconRef.current) {
      iconRef.current.style.animation = "none";
      void iconRef.current.getBoundingClientRect();
      iconRef.current.style.animation = "fyp-heartbeat 420ms var(--ease-spring) both";
    }
    toggle(product);
  }

  return (
    /* Ver la nota de CompareToggle: el posicionamiento externo va en el
       envoltorio, el botón se queda con su `relative` para el área de toque. */
    <span className={`inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={isSelected}
        aria-label={`${label}: ${product.name}`}
        title={label}
        data-testid="favorite-toggle"
        className={`relative flex items-center justify-center rounded-full border outline-none before:absolute before:-inset-2 before:content-[''] ${
          size === "sm" ? "h-7 w-7" : "h-8 w-8"
        } transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] focus-visible:ring-2 focus-visible:ring-[var(--favorite)] active:scale-90 ${
          isSelected
            ? "border-[var(--favorite)] bg-[var(--favorite-soft)] text-[var(--favorite)]"
            : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:border-[var(--favorite)] hover:text-[var(--favorite)]"
        }`}
      >
        <svg
          ref={iconRef}
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
          fill={isSelected ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4.5 6.9 4.5c1.9 0 3.5 1 4.4 2.4a5.1 5.1 0 0 1 4.4-2.4c3.3 0 5.6 3.1 4.3 6.6C19.5 15.9 12 20.5 12 20.5Z" />
        </svg>
      </button>
    </span>
  );
}
