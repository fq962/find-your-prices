"use client";

import { useState } from "react";
import type { ProductImage } from "@/server/services/catalog";

export interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
  discountPercent?: number;
}

/**
 * Galería de la ficha de producto.
 *
 * Una sola imagen grande más una tira de miniaturas, en vez de un carrusel.
 * El carrusel esconde cuántas imágenes hay y obliga a avanzar de una en una;
 * la tira las muestra todas de entrada y deja saltar a cualquiera. Con
 * artículos que traen cinco o seis fotos, eso es la diferencia entre ver el
 * producto y adivinarlo.
 *
 * La imagen grande cambia por estado, no por scroll: nada se mueve solo.
 */
export function ProductGallery({ images, productName, discountPercent }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-3xl bg-[var(--bg-inset)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-12 w-12 text-[var(--text-tertiary)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5V7.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5Z M3 16.5 8.25 11l3 3 3.75-4.5L21 15"
          />
        </svg>
      </div>
    );
  }

  const active = images[Math.min(activeIndex, images.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)]">
        <button
          type="button"
          onClick={() => setIsZoomed((value) => !value)}
          aria-label={isZoomed ? "Reducir imagen" : `Ampliar imagen de ${productName}`}
          className="block w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.url}
            alt={active.altText ?? productName}
            /* aspect-square reserva el alto antes de que cargue: sin esto la
               ficha entera salta cuando llega la imagen. */
            className={`aspect-square w-full object-contain p-6 transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] ${
              isZoomed ? "scale-[1.6]" : "scale-100"
            }`}
          />
        </button>

        {discountPercent !== undefined && (
          <span className="pointer-events-none absolute top-4 left-4 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[0.8125rem] font-semibold tabular-nums text-[var(--accent-contrast)]">
            -{Math.round(discountPercent)}%
          </span>
        )}

        {images.length > 1 && (
          <span className="pointer-events-none absolute right-4 bottom-4 rounded-full bg-[var(--bg)]/85 px-2.5 py-1 text-[0.75rem] tabular-nums text-[var(--text-secondary)] backdrop-blur-sm">
            {activeIndex + 1} / {images.length}
          </span>
        )}
      </div>

      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <li key={image.url} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    setIsZoomed(false);
                  }}
                  aria-label={`Ver imagen ${index + 1} de ${images.length}`}
                  aria-current={isActive}
                  className={`block h-16 w-16 overflow-hidden rounded-xl border bg-[var(--bg-elevated)] outline-none transition-[border-color,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    isActive
                      ? "border-[var(--text)] opacity-100"
                      : "border-[var(--border)] opacity-60 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-contain p-1.5"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
