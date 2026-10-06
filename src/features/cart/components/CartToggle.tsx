"use client";

import { useRef, type MouseEvent } from "react";
import type { Product } from "@/types";
import { useCart } from "../useCart";

/**
 * Agregar o quitar un producto de la cotización, desde la tarjeta.
 *
 * Interruptor como `FavoriteToggle`, con el que se alinea en la esquina: el
 * mismo control agrega y quita, y el estado se ve sin abrir nada. Pulsado se
 * pinta en tinta —casi negro— y no en un color de marca: el
 * corazón ya es rosa y el descuento verde; el carrito es una herramienta, no
 * un afecto ni un hallazgo, y se distingue por contraste.
 *
 * Los textos llegan por prop por el mismo motivo que en `FavoriteToggle`.
 */

export interface CartToggleLabels {
  add: string;
  remove: string;
}

export const DEFAULT_CART_TOGGLE_LABELS: CartToggleLabels = {
  add: "Add to quote",
  remove: "Remove from quote",
};

export interface CartToggleProps {
  product: Product;
  labels?: CartToggleLabels;
  size?: "sm" | "md";
  className?: string;
}

export function CartToggle({
  product,
  labels = DEFAULT_CART_TOGGLE_LABELS,
  size = "md",
  className = "",
}: CartToggleProps) {
  const { contains, add, remove } = useCart();
  const iconRef = useRef<SVGSVGElement>(null);

  const isSelected = contains(product.id);
  const label = isSelected ? labels.remove : labels.add;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Vive encima de una tarjeta que es enlace: sin esto, además navega.
    event.preventDefault();
    event.stopPropagation();

    if (!isSelected && iconRef.current) {
      iconRef.current.style.animation = "none";
      void iconRef.current.getBoundingClientRect();
      iconRef.current.style.animation = "fyp-cart-drop 460ms var(--ease-spring) both";
    }
    if (isSelected) remove(product.id);
    else add(product);
  }

  return (
    <span className={`inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={isSelected}
        aria-label={`${label}: ${product.name}`}
        title={label}
        data-testid="cart-toggle"
        className={`relative flex items-center justify-center rounded-full border outline-none before:absolute before:-inset-2 before:content-[''] ${
          size === "sm" ? "h-7 w-7" : "h-8 w-8"
        } transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:scale-90 ${
          isSelected
            ? // Tinta fija y no `--text`: la placa de la foto es blanca en los
              // dos temas, y en oscuro `--text` es casi blanco.
              "border-neutral-900 bg-neutral-900 text-neutral-50"
            : "border-transparent bg-transparent text-neutral-500 hover:text-neutral-900"
        }`}
      >
        <svg
          ref={iconRef}
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4h2.2l2.2 11.1a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.6 8H6.1" />
          <circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="17" cy="20" r="1.1" fill="currentColor" stroke="none" />
          {isSelected ? (
            <path d="m10.2 11.6 1.9 1.9 3.6-3.8" />
          ) : (
            <path d="M13 9.4v4.4M10.8 11.6h4.4" />
          )}
        </svg>
      </button>
    </span>
  );
}
