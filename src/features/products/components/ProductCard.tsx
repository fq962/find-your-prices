"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";

export interface ProductCardProps {
  product: Product;
  locale?: string;
  viewLargerImageLabel?: string;
  closeImageLabel?: string;
}

export function ProductCard({
  product,
  locale,
  viewLargerImageLabel = "View larger image of",
  closeImageLabel = "Close",
}: ProductCardProps) {
  const { name, price, currency, store, imageUrl, description, availability } = product;
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
    <div className="flex items-center gap-4 py-4 sm:gap-5">
      {imageUrl ? (
        <button
          type="button"
          onClick={() => setIsImageOpen(true)}
          aria-label={`${viewLargerImageLabel} ${name}`}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 transition-opacity hover:opacity-80 sm:h-20 sm:w-20"
        >
          <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 sm:h-20 sm:w-20">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6 text-neutral-300"
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

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-base font-medium text-neutral-900">{name}</h3>
        {description && (
          <p className="line-clamp-1 text-sm text-neutral-500 sm:line-clamp-2">{description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-neutral-500">
          <span>{store}</span>
          {availability && (
            <>
              <span aria-hidden="true" className="text-neutral-300">
                ·
              </span>
              <span>{availability}</span>
            </>
          )}
        </div>
      </div>

      <p className="shrink-0 text-base font-semibold tabular-nums text-neutral-900 sm:text-lg">
        {formatPrice(price, currency, locale)}
      </p>

      {imageUrl && isImageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsImageOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsImageOpen(false)}
            aria-label={closeImageLabel}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={imageUrl}
            alt={name}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
