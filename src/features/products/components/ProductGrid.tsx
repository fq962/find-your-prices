import type { CSSProperties } from "react";
import type { Product } from "@/types";
import {
  DEFAULT_DENSITY,
  gridClassesFor,
  type Density,
  type ViewMode,
} from "@/features/products/viewPreferences";
import { ProductCard } from "./ProductCard";
import { ProductTile } from "./ProductTile";
import type { CompareToggleLabels } from "./CompareToggle";

export interface ProductGridProps {
  products: Product[];
  locale?: string;
  emptyMessage?: string;
  viewLargerImageLabel?: string;
  closeImageLabel?: string;
  /**
   * Modo de presentación. Por defecto la lista. `compare` no entra acá: esa
   * vista no es una retícula de productos sino una columna por tienda, y la
   * resuelve `CompareGrid`.
   */
  mode?: Exclude<ViewMode, "compare">;
  density?: Density;
  /** Ruta de la ficha de cada producto. Sin esto no se enlaza al detalle. */
  productHref?: (product: Product) => string;
  /** Textos del control que aparta un producto para compararlo. */
  compareLabels?: CompareToggleLabels;
  /**
   * Nombre accesible de la lista. Desde que el pie de página tiene su propia
   * lista de enlaces, "la lista" dejó de ser una sola en el documento: sin
   * nombre, un lector de pantalla anuncia dos listas idénticas y no hay forma
   * de saltar a los resultados.
   */
  label?: string;
}

/** Tope del escalonado: pasado el 8º elemento el retardo deja de crecer. */
const MAX_STAGGERED_ITEMS = 8;

/**
 * Renderiza los resultados en el modo elegido.
 *
 * La lista y las cuadrículas usan componentes distintos a propósito
 * (`ProductCard` y `ProductTile`): no son la misma tarjeta con otro ancho,
 * responden a formas distintas de mirar el catálogo. Ver `ProductTile`.
 */
export function ProductGrid({
  products,
  locale,
  emptyMessage,
  viewLargerImageLabel,
  closeImageLabel,
  mode = "list",
  density = DEFAULT_DENSITY,
  productHref,
  compareLabels,
  label,
}: ProductGridProps) {
  const hasProducts = products.length > 0;
  const isList = mode === "list";

  const listClasses =
    "overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] [&>li+li]:border-t [&>li+li]:border-[var(--border)]";

  return (
    <>
      <ul
        aria-label={label}
        className={hasProducts ? (isList ? listClasses : gridClassesFor(mode, density)) : ""}
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
            {isList ? (
              <ProductCard
                product={product}
                locale={locale}
                href={productHref?.(product)}
                viewLargerImageLabel={viewLargerImageLabel}
                closeImageLabel={closeImageLabel}
                compareLabels={compareLabels}
              />
            ) : (
              <ProductTile
                product={product}
                href={productHref?.(product) ?? product.url ?? "#"}
                mode={mode}
                density={density}
                locale={locale}
                compareLabels={compareLabels}
              />
            )}
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
