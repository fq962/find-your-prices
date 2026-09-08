import type { CSSProperties } from "react";
import type { Product } from "@/types";
import { ProductCard } from "./ProductCard";

export interface ProductGridProps {
  products: Product[];
  locale?: string;
  emptyMessage?: string;
  viewLargerImageLabel?: string;
  closeImageLabel?: string;
}

/** Tope del escalonado: pasado el 8º elemento el retardo deja de crecer. */
const MAX_STAGGERED_ITEMS = 8;

export function ProductGrid({
  products,
  locale,
  emptyMessage,
  viewLargerImageLabel,
  closeImageLabel,
}: ProductGridProps) {
  const hasProducts = products.length > 0;

  return (
    <>
      <ul
        className={
          hasProducts
            ? "overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] [&>li+li]:border-t [&>li+li]:border-[var(--border)]"
            : ""
        }
      >
        {products.map((product, index) => (
          <li
            key={product.id}
            className="enter"
            style={
              {
                "--enter-delay": `${Math.min(index, MAX_STAGGERED_ITEMS) * 55}ms`,
              } as CSSProperties
            }
          >
            <ProductCard
              product={product}
              locale={locale}
              viewLargerImageLabel={viewLargerImageLabel}
              closeImageLabel={closeImageLabel}
            />
          </li>
        ))}
      </ul>

      {!hasProducts && emptyMessage && (
        <div className="enter flex flex-col items-center gap-4 rounded-3xl border border-dashed border-[var(--border-strong)] px-6 py-20 text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            className="h-8 w-8 text-[var(--text-tertiary)]"
          >
            <circle cx="11" cy="11" r="6.4" />
            <path d="m20 20-3.6-3.6" />
          </svg>
          <p className="max-w-[32ch] text-[0.9375rem] text-[var(--text-secondary)]">
            {emptyMessage}
          </p>
        </div>
      )}
    </>
  );
}
