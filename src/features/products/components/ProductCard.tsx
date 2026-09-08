"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";

export interface ProductCardProps {
  product: Product;
  locale?: string;
  /**
   * Ruta de la ficha propia del producto. Cuando se pasa, el nombre lleva ahí
   * en vez de a la tienda: la ficha tiene el histórico de precio, la galería
   * completa y los datos técnicos, y desde ahí se sale a comprar. Sin este
   * prop se enlaza directo a la tienda, que es el comportamiento anterior.
   */
  href?: string;
  viewLargerImageLabel?: string;
  closeImageLabel?: string;
}

export function ProductCard({
  product,
  locale,
  href,
  viewLargerImageLabel = "View larger image of",
  closeImageLabel = "Close",
}: ProductCardProps) {
  const { name, price, currency, store, imageUrl, description, availability } = product;
  const { url, listPrice, discountPercent } = product;
  const titleHref = href ?? url;
  // Salir del sitio merece aviso; navegar dentro, no.
  const isExternal = titleHref !== undefined && titleHref === url && href === undefined;
  // Solo se considera oferta si el precio tachado es realmente mayor: varias
  // tiendas repiten el precio actual en el campo "antes".
  const hasDiscount = listPrice !== undefined && listPrice > price;
  const [isImageOpen, setIsImageOpen] = useState(false);

  useEffect(() => {
    if (!isImageOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsImageOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isImageOpen]);

  return (
    <div className="group relative flex items-center gap-4 px-3 py-5 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:bg-[var(--bg-subtle)] sm:gap-6 sm:px-4">
      {/* El porcentaje se ancla a la miniatura, no al precio: es la señal que
          hace que el ojo se detenga al recorrer la lista. */}
      {hasDiscount && discountPercent !== undefined && (
        <span className="pointer-events-none absolute top-3 left-1 z-10 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-[var(--accent-contrast)] shadow-[var(--shadow-sm)] sm:left-2">
          -{Math.round(discountPercent)}%
        </span>
      )}

      {imageUrl ? (
        <button
          type="button"
          onClick={() => setIsImageOpen(true)}
          aria-label={`${viewLargerImageLabel} ${name}`}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-inset)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.04] active:scale-[0.98] sm:h-20 sm:w-20"
        >
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.08]"
          />
        </button>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--bg-inset)] sm:h-20 sm:w-20">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6 text-[var(--text-tertiary)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5V7.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5Z M3 16.5 8.25 11l3 3 3.75-4.5L21 15"
            />
          </svg>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-[1.0625rem] sm:truncate font-medium tracking-[-0.015em] text-[var(--text)]">
          {titleHref ? (
            <a
              href={titleHref}
              {...(isExternal
                ? { target: "_blank", rel: "noopener noreferrer nofollow" }
                : {})}
              className="rounded-sm underline-offset-[3px] outline-none transition-colors duration-[var(--dur-fast)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {name}
            </a>
          ) : (
            name
          )}
        </h3>
        {description && (
          <p className="line-clamp-1 text-[0.9375rem] leading-snug text-[var(--text-secondary)] sm:line-clamp-2">
            {description}
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] tracking-[0.005em] text-[var(--text-tertiary)]">
          <span className="uppercase">{store}</span>
          {availability && (
            <>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-50" />
              <span>{availability}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)] group-hover:-translate-x-0.5">
        <p className="text-[1.0625rem] font-semibold tracking-[-0.02em] tabular-nums text-[var(--text)] sm:text-[1.25rem]">
          {formatPrice(price, currency, locale)}
        </p>
        {hasDiscount && (
          <p className="text-[0.8125rem] tabular-nums text-[var(--text-tertiary)] line-through decoration-[var(--text-tertiary)]/50">
            {formatPrice(listPrice, currency, locale)}
          </p>
        )}
      </div>

      {/* El visor va por portal a <body>: la fila lleva una animación de
          entrada cuyo `transform` persiste, y un ancestro transformado
          convierte cualquier `position: fixed` interno en `absolute`. */}
      {imageUrl &&
        isImageOpen &&
        createPortal(
          <div
            onClick={() => setIsImageOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xl"
            style={{ animation: "fyp-fade 240ms var(--ease-out-quart) both" }}
          >
            <button
              type="button"
              onClick={() => setIsImageOpen(false)}
              aria-label={closeImageLabel}
              className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-[background-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-105 hover:bg-white/20 active:scale-95"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={imageUrl}
              alt={name}
              onClick={(event) => event.stopPropagation()}
              className="max-h-[85vh] max-w-[min(90vw,720px)] rounded-3xl bg-[var(--bg-elevated)] object-contain shadow-[var(--shadow-lg)]"
              style={{ animation: "fyp-scale-in 420ms var(--ease-out-expo) both" }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
