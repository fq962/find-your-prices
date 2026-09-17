import type { CSSProperties } from "react";
import type { Product } from "@/types";
import { ProductTile } from "./ProductTile";
import type { CompareToggleLabels } from "./CompareToggle";
import type { FavoriteToggleLabels } from "./FavoriteToggle";

export interface ProductGridProps {
  products: Product[];
  locale?: string;
  emptyMessage?: string;
  /**
   * Cuántas columnas como máximo. `3` es la del catálogo, que comparte el
   * ancho con la barra de filtros en escritorio; `4` es para las retículas
   * que ocupan todo el ancho (populares de una categoría, favoritos).
   */
  columns?: 3 | 4;
  /** Ruta de la ficha de cada producto. Sin esto se enlaza a la tienda. */
  productHref?: (product: Product) => string | undefined;
  /** Textos del control que aparta un producto para compararlo. */
  compareLabels?: CompareToggleLabels;
  /** Textos del corazón de favoritos. */
  favoriteLabels?: FavoriteToggleLabels;
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
 * Clases de la retícula, mobile-first.
 *
 * Dos columnas en teléfono es el mínimo al que la foto todavía sirve para
 * reconocer el producto; tres en tableta y escritorio es el máximo al que el
 * nombre cabe en dos líneas junto a la barra de filtros. El número está
 * deliberadamente por debajo de lo que el ancho permitiría: con más columnas
 * la pantalla se vuelve una pared de fichas que no invita a mirar ninguna.
 */
const GRID_CLASSES: Record<NonNullable<ProductGridProps["columns"]>, string> = {
  3: "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-9",
  4: "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-9 lg:grid-cols-4",
};

/**
 * La retícula de resultados: una ficha por producto, siempre la misma.
 *
 * Antes elegía entre una fila de lista y una ficha según el modo de vista;
 * ahora sólo existe la ficha (ver `ProductTile`), así que este componente se
 * limita a repartirla en columnas y a escalonar la entrada.
 */
export function ProductGrid({
  products,
  locale,
  emptyMessage,
  columns = 3,
  productHref,
  compareLabels,
  favoriteLabels,
  label,
}: ProductGridProps) {
  const hasProducts = products.length > 0;

  return (
    <>
      <ul aria-label={label} className={hasProducts ? GRID_CLASSES[columns] : ""}>
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
            <ProductTile
              product={product}
              href={productHref?.(product) ?? product.url ?? "#"}
              locale={locale}
              compareLabels={compareLabels}
              favoriteLabels={favoriteLabels}
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
