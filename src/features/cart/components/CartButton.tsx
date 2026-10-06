"use client";

import Link from "next/link";
import type { Product } from "@/types";
import { useCart } from "../useCart";
import { QuantityStepper, type QuantityStepperLabels } from "./QuantityStepper";

export interface CartButtonLabels extends QuantityStepperLabels {
  add: string;
  inQuote: string;
  viewQuote: string;
}

export interface CartButtonProps {
  product: Product;
  labels: CartButtonLabels;
  quoteHref: string;
}

/**
 * El control de cotización de la ficha.
 *
 * En la tarjeta basta un interruptor; acá hay espacio y la decisión es otra:
 * quien está en la ficha ya sabe que lo quiere y lo que falta es CUÁNTOS. Por
 * eso, una vez agregado, el botón se convierte en la cantidad y en el camino a
 * la cotización, en vez de quedarse como un "quitar" que nadie vino a buscar.
 */
export function CartButton({ product, labels, quoteHref }: CartButtonProps) {
  const cart = useCart();
  const quantity = cart.quantityOf(product.id);

  if (quantity === 0) {
    return (
      <button
        type="button"
        onClick={() => cart.add(product)}
        className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-5 text-[0.9375rem] font-medium text-[var(--text)] outline-none transition-[border-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.015] hover:border-[var(--text)] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
      >
        <CartIcon />
        {labels.add}
      </button>
    );
  }

  return (
    <div className="enter-fade flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label={labels.inQuote}>
      <span className="inline-flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--text-secondary)]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text)] text-[var(--text-inverted)]">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5.5 12.5 4 4 9-9" />
          </svg>
        </span>
        {labels.inQuote}
      </span>
      <QuantityStepper
        value={quantity}
        onChange={(value) => cart.setQuantity(product.id, value)}
        labels={labels}
        itemName={product.name}
      />
      <Link
        href={quoteHref}
        className="group inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[0.875rem] font-medium text-[var(--accent)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--accent-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {labels.viewQuote}
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] group-hover:-rotate-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h2.2l2.2 11.1a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.6 8H6.1" />
      <circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.1" fill="currentColor" stroke="none" />
      <path d="M13 9.4v4.4M10.8 11.6h4.4" />
    </svg>
  );
}
