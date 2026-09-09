"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types";

/**
 * Tabla de comparación de los productos apartados.
 *
 * Una tabla de verdad y no una retícula de tarjetas: comparar es leer el mismo
 * atributo en varios artículos, y eso es exactamente lo que hace una fila. La
 * columna de etiquetas queda fija al desplazar en horizontal, porque en cuanto
 * hay cuatro columnas en un teléfono se pierde de vista qué se está mirando.
 *
 * Las filas cuyo dato no tiene ninguno de los productos no se pintan: una fila
 * entera de guiones ocupa el mismo espacio que una con información y no dice
 * nada.
 */

export interface ProductComparisonLabels {
  title: string;
  close: string;
  remove: string;
  clear: string;
  price: string;
  listPrice: string;
  discount: string;
  store: string;
  brand: string;
  category: string;
  availability: string;
  rating: string;
  bestPrice: string;
  viewDetail: string;
  empty: string;
}

export interface ProductComparisonDialogProps {
  products: Product[];
  labels: ProductComparisonLabels;
  locale?: string;
  onClose: () => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  productHref?: (product: Product) => string;
}

export function ProductComparisonDialog({
  products,
  labels,
  locale,
  onClose,
  onRemove,
  onClear,
  productHref,
}: ProductComparisonDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    // El fondo no debe desplazarse detrás del panel: en móvil es la diferencia
    // entre cerrar el diálogo y perder el sitio donde se estaba en el catálogo.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // El precio más bajo se marca una sola vez y se calcula acá para que la
  // marca de la cabecera y la de la fila de precio no puedan discrepar.
  const bestPrice = products.reduce<number | null>(
    (best, product) =>
      product.price > 0 && (best === null || product.price < best) ? product.price : best,
    null,
  );

  const has = (predicate: (product: Product) => boolean) => products.some(predicate);

  return createPortal(
    <div
      onClick={onClose}
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-xl sm:items-center sm:p-6"
      style={{ animation: "fyp-fade 220ms var(--ease-out-quart) both" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)] sm:max-h-[86vh] sm:max-w-[64rem] sm:rounded-3xl"
        style={{ animation: "fyp-scale-in 340ms var(--ease-out-expo) both" }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-[var(--text)]">
            {labels.title}
          </h2>

          <div className="flex items-center gap-2">
            {products.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--accent)] outline-none transition-opacity duration-[var(--dur-base)] hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {labels.clear}
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={labels.close}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] outline-none transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] hover:bg-[var(--bg-subtle)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              >
                <path d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {products.length === 0 ? (
          <p className="px-6 py-16 text-center text-[0.9375rem] text-[var(--text-secondary)]">
            {labels.empty}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{labels.title}</caption>

              <thead>
                <tr>
                  {/* Esquina vacía: ancla la columna de etiquetas, que queda
                      fija al desplazar en horizontal. */}
                  <th
                    scope="col"
                    className="sticky top-0 left-0 z-30 w-[7.5rem] border-r border-[var(--border)] bg-[var(--bg-elevated)] sm:w-[9rem]"
                  >
                    <span className="sr-only">{labels.title}</span>
                  </th>
                  {products.map((product) => (
                    <th
                      key={product.id}
                      scope="col"
                      className="sticky top-0 z-20 min-w-[10rem] border-b border-[var(--border)] bg-[var(--bg-elevated)] p-3 align-top font-normal sm:min-w-[12rem]"
                    >
                      <ProductHeader
                        product={product}
                        href={productHref?.(product) ?? product.url}
                        removeLabel={labels.remove}
                        onRemove={() => onRemove(product.id)}
                      />
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                <Row label={labels.price} products={products} highlight>
                  {(product) => (
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] tabular-nums text-[var(--text)]">
                        {formatPrice(product.price, product.currency, locale)}
                      </span>
                      {bestPrice !== null && product.price === bestPrice && (
                        <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.02em] text-[var(--accent)] uppercase">
                          {labels.bestPrice}
                        </span>
                      )}
                    </span>
                  )}
                </Row>

                {has((product) => product.listPrice !== undefined) && (
                  <Row label={labels.listPrice} products={products}>
                    {(product) =>
                      product.listPrice !== undefined && product.listPrice > product.price ? (
                        <span className="tabular-nums text-[var(--text-tertiary)] line-through">
                          {formatPrice(product.listPrice, product.currency, locale)}
                        </span>
                      ) : null
                    }
                  </Row>
                )}

                {has((product) => product.discountPercent !== undefined) && (
                  <Row label={labels.discount} products={products}>
                    {(product) =>
                      product.discountPercent !== undefined ? (
                        <span className="font-semibold tabular-nums text-[var(--accent)]">
                          -{Math.round(product.discountPercent)}%
                        </span>
                      ) : null
                    }
                  </Row>
                )}

                <Row label={labels.store} products={products}>
                  {(product) => <span className="uppercase">{product.store}</span>}
                </Row>

                {has((product) => Boolean(product.brand)) && (
                  <Row label={labels.brand} products={products}>
                    {(product) => product.brand ?? null}
                  </Row>
                )}

                {has((product) => Boolean(product.category)) && (
                  <Row label={labels.category} products={products}>
                    {(product) => product.category}
                  </Row>
                )}

                {has((product) => Boolean(product.availability)) && (
                  <Row label={labels.availability} products={products}>
                    {(product) =>
                      product.availability ? (
                        <span
                          className={
                            product.inStock === false ? "text-[var(--text-tertiary)]" : undefined
                          }
                        >
                          {product.availability}
                        </span>
                      ) : null
                    }
                  </Row>
                )}

                {has((product) => product.ratingAverage !== undefined) && (
                  <Row label={labels.rating} products={products}>
                    {(product) =>
                      product.ratingAverage !== undefined ? (
                        <span className="flex items-center gap-1 tabular-nums">
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5 text-[var(--text-secondary)]"
                            fill="currentColor"
                          >
                            <path d="m12 17.3-6.16 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.48 4.73 1.64 7.03z" />
                          </svg>
                          {product.ratingAverage.toFixed(1)}
                          {product.ratingCount !== undefined && product.ratingCount > 0 && (
                            <span className="text-[var(--text-tertiary)]">
                              ({product.ratingCount})
                            </span>
                          )}
                        </span>
                      ) : null
                    }
                  </Row>
                )}

                <tr>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-[var(--border)] bg-[var(--bg-elevated)]"
                  />
                  {products.map((product) => {
                    const href = productHref?.(product) ?? product.url;
                    return (
                      <td key={product.id} className="p-3 align-top">
                        {href && (
                          <a
                            href={href}
                            {...(href === product.url
                              ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                              : {})}
                            className="inline-flex items-center justify-center rounded-full bg-[var(--text)] px-3.5 py-2 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]"
                          >
                            {labels.viewDetail}
                          </a>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ProductHeaderProps {
  product: Product;
  href?: string;
  removeLabel: string;
  onRemove: () => void;
}

function ProductHeader({ product, href, removeLabel, onRemove }: ProductHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div className="h-20 w-full overflow-hidden rounded-xl bg-[var(--bg-inset)]">
          {product.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.imageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-contain p-2"
            />
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`${removeLabel}: ${product.name}`}
          title={removeLabel}
          className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] shadow-[var(--shadow-sm)] outline-none transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] hover:text-[var(--text)] active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <h3 className="line-clamp-3 text-[0.8125rem] leading-[1.35] font-medium text-[var(--text)]">
        {href ? (
          <a
            href={href}
            {...(href === product.url
              ? { target: "_blank", rel: "noopener noreferrer nofollow" }
              : {})}
            className="rounded-sm underline-offset-[3px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {product.name}
          </a>
        ) : (
          product.name
        )}
      </h3>
    </div>
  );
}

interface RowProps {
  label: string;
  products: Product[];
  /** Fila destacada: fondo propio para el dato que se compara de verdad. */
  highlight?: boolean;
  children: (product: Product) => ReactNode;
}

function Row({ label, products, highlight = false, children }: RowProps) {
  const cellBackground = highlight ? "bg-[var(--bg-subtle)]" : "bg-[var(--bg-elevated)]";

  return (
    <tr className="border-t border-[var(--border)]">
      <th
        scope="row"
        /* Borde derecho: al desplazar en horizontal, las columnas pasan por
           debajo de esta y sin una línea el corte no se ve. */
        className={`sticky left-0 z-10 border-r border-[var(--border)] p-3 align-top text-[0.6875rem] font-medium tracking-[0.12em] text-[var(--text-tertiary)] uppercase ${cellBackground}`}
      >
        {label}
      </th>
      {products.map((product) => (
        <td
          key={product.id}
          className={`p-3 align-top text-[0.875rem] text-[var(--text-secondary)] ${cellBackground}`}
        >
          {children(product) ?? <span className="text-[var(--text-tertiary)]">—</span>}
        </td>
      ))}
    </tr>
  );
}
