"use client";

import Link from "next/link";
import { useLocale } from "@/features/i18n/LocaleContext";
import type { ComparisonColumn } from "@/features/products/useStoreComparison";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types";

/**
 * Comparación lado a lado: una columna por tienda.
 *
 * La forma es la respuesta a la pregunta "cuál de estas tiendas lo tiene más
 * barato". Por eso las columnas son verticales y estrechas y las filas son
 * bajas: lo que se compara se recorre con un barrido horizontal de la vista, y
 * lo que hace posible ese barrido es que el precio de cada fila caiga siempre a
 * la misma altura. Una cuadrícula de fichas grandes no lo permite.
 *
 * Mobile-first, y acá la decisión importante: en teléfono las columnas NO se
 * apilan. Apilarlas convertiría la comparación en una lista larga —justo lo que
 * el modo lista ya hace—, así que se deslizan en horizontal con anclaje, y la
 * siguiente columna asoma para que se vea que hay más.
 */

export interface CompareGridProps {
  columns: ComparisonColumn[];
  locale?: string;
  productHref?: (product: Product) => string;
  /** Se muestra en lugar de las columnas mientras no haya nada que comparar. */
  showEmptyState: boolean;
}

/** Precio más bajo de una columna. `null` si la columna no trae nada. */
function cheapestPrice(products: Product[]): number | null {
  let min: number | null = null;
  for (const product of products) {
    if (product.price > 0 && (min === null || product.price < min)) min = product.price;
  }
  return min;
}

export function CompareGrid({ columns, locale, productHref, showEmptyState }: CompareGridProps) {
  const { t } = useLocale();

  if (showEmptyState) {
    return (
      <div className="enter flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[var(--border-strong)] px-6 py-16 text-center sm:py-24">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          className="h-8 w-8 text-[var(--text-tertiary)]"
        >
          <path d="M4 5h5v14H4zM15 5h5v14h-5z" />
          <path d="M12 7v10" />
        </svg>
        <p className="text-[1.0625rem] font-medium text-[var(--text)]">
          {t("compareEmptyStateTitle")}
        </p>
        <p className="max-w-[42ch] text-[0.9375rem] leading-[1.5] text-[var(--text-secondary)]">
          {t("compareEmptyStateBody")}
        </p>
      </div>
    );
  }

  // El mínimo global decide dos marcas distintas: la tienda que gana (en su
  // cabecera) y el artículo concreto que gana (en su fila). Se calcula una vez
  // acá para que las dos digan lo mismo.
  const columnMinimums = columns.map((column) => cheapestPrice(column.products));
  const globalMinimum = columnMinimums.reduce<number | null>(
    (best, price) => (price === null ? best : best === null ? price : Math.min(best, price)),
    null,
  );

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:overflow-visible sm:px-0">
      {/* items-start: cada columna mide lo que mide su contenido. Estirarlas
          todas al alto de la más larga dejaría columnas medio vacías con un
          borde marcando aire, que se lee como si faltara algo por cargar. */}
      <div className="flex snap-x snap-mandatory items-start gap-3 sm:gap-4">
        {columns.map((column, index) => (
          <CompareColumn
            key={`${column.store ?? "empty"}-${index}`}
            column={column}
            locale={locale}
            productHref={productHref}
            isCheapestColumn={globalMinimum !== null && columnMinimums[index] === globalMinimum}
            bestPrice={globalMinimum}
          />
        ))}
      </div>
    </div>
  );
}

interface CompareColumnProps {
  column: ComparisonColumn;
  locale?: string;
  productHref?: (product: Product) => string;
  isCheapestColumn: boolean;
  bestPrice: number | null;
}

function CompareColumn({
  column,
  locale,
  productHref,
  isCheapestColumn,
  bestPrice,
}: CompareColumnProps) {
  const { t } = useLocale();
  const columnMinimum = cheapestPrice(column.products);

  return (
    /* A partir de sm, `basis-0 grow` reparte el ancho en partes iguales sea
       cual sea el número de columnas, sin necesitar una clase de grid distinta
       por cada cantidad posible. */
    <section
      className={`flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] transition-[border-color] duration-[var(--dur-base)] sm:w-auto sm:min-w-0 sm:shrink sm:grow sm:basis-0 ${
        isCheapestColumn ? "border-[var(--accent)]" : "border-[var(--border)]"
      }`}
    >
      <header className="flex flex-col gap-1 border-b border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-[0.875rem] font-semibold tracking-[-0.01em] text-[var(--text)] uppercase">
            {column.store ?? t("compareChooseStoreLabel")}
          </h3>
          {column.store && (
            <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">
              {column.total}
            </span>
          )}
        </div>

        {/* Alto mínimo fijo: las cabeceras de todas las columnas se mantienen
            alineadas aunque sólo una tenga la marca de más barato. */}
        <div className="flex min-h-5 items-center gap-1.5">
          {columnMinimum !== null && (
            <span className="text-[0.75rem] tabular-nums text-[var(--text-secondary)]">
              {t("compareFromLabel")}{" "}
              <span className="font-semibold text-[var(--text)]">
                {formatPrice(columnMinimum, column.products[0]?.currency ?? "HNL", locale)}
              </span>
            </span>
          )}
          {isCheapestColumn && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.02em] text-[var(--accent-contrast)] uppercase">
              {t("compareCheapestColumnLabel")}
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col divide-y divide-[var(--border)]">
        {column.isLoading &&
          column.products.length === 0 &&
          /* Esqueletos con el alto exacto de una fila: la columna no cambia de
             tamaño cuando llegan los datos. */
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2.5 px-3 py-2.5">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-[var(--bg-inset)]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="h-2.5 w-full animate-pulse rounded bg-[var(--bg-inset)]" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--bg-inset)]" />
              </div>
            </div>
          ))}

        {!column.isLoading && column.store && column.products.length === 0 && (
          <p className="px-3 py-8 text-center text-[0.8125rem] leading-[1.5] text-[var(--text-tertiary)]">
            {t("compareNoResultsInStore")}
          </p>
        )}

        {column.products.map((product) => (
          <CompareRow
            key={product.id}
            product={product}
            locale={locale}
            href={productHref?.(product) ?? product.url ?? "#"}
            isBestPrice={bestPrice !== null && product.price === bestPrice}
          />
        ))}
      </div>
    </section>
  );
}

interface CompareRowProps {
  product: Product;
  href: string;
  locale?: string;
  isBestPrice: boolean;
}

function CompareRow({ product, href, locale, isBestPrice }: CompareRowProps) {
  const { t } = useLocale();
  const { name, price, currency, listPrice, imageUrl, discountPercent, inStock } = product;
  const hasDiscount = listPrice !== undefined && listPrice > price;

  return (
    <Link
      href={href}
      className="group flex items-start gap-2.5 px-3 py-2.5 outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
    >
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--bg-inset)]">
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h4 className="line-clamp-2 text-[0.8125rem] leading-[1.35] text-[var(--text)]">{name}</h4>

        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] tabular-nums text-[var(--text)]">
            {formatPrice(price, currency, locale)}
          </span>
          {hasDiscount && discountPercent !== undefined && (
            <span className="text-[0.6875rem] font-semibold tabular-nums text-[var(--accent)]">
              -{Math.round(discountPercent)}%
            </span>
          )}
        </div>

        {(isBestPrice || inStock === false) && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {isBestPrice && (
              <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.02em] text-[var(--accent)] uppercase">
                {t("compareBestPriceLabel")}
              </span>
            )}
            {inStock === false && product.availability && (
              <span className="text-[0.6875rem] text-[var(--text-tertiary)]">
                {product.availability}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
