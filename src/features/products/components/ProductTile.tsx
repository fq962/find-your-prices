"use client";

import Link from "next/link";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";
import type { Density, ViewMode } from "@/features/products/viewPreferences";
import { imageHeightFor } from "@/features/products/viewPreferences";
import { CompareToggle, type CompareToggleLabels } from "./CompareToggle";

export interface ProductTileProps {
  product: Product;
  href: string;
  mode: Exclude<ViewMode, "list" | "compare">;
  density: Density;
  locale?: string;
  compareLabels?: CompareToggleLabels;
}

/**
 * Ficha de producto para las vistas de cuadrícula y galería.
 *
 * Vive aparte de `ProductCard` —que resuelve la fila de lista— porque las dos
 * responden a preguntas distintas. La fila sirve para comparar precios de un
 * vistazo, así que alinea las cifras en una columna. La ficha sirve para
 * reconocer un producto, así que manda la imagen y el precio va debajo.
 * Fusionarlas en un componente con banderas habría hecho ambas peores.
 *
 * Jerarquía deliberada (una sola cosa domina): la imagen ocupa la mayor parte
 * del bloque, el precio es el único texto en peso fuerte, y marca, tienda y
 * disponibilidad quedan en gris pequeño. El descuento es el único elemento con
 * color fuerte: es lo que hace que el ojo se detenga al barrer la cuadrícula.
 *
 * Ese color es el verde de "precio ganador", no el azul de la interfaz. El azul
 * dice "esto se puede pulsar" —enlaces, foco, limpiar filtros— y gastarlo
 * también en el descuento obligaba a mirar dos veces para saber cuál de los dos
 * azules de la ficha era la ganga.
 */
export function ProductTile({
  product,
  href,
  mode,
  density,
  locale,
  compareLabels,
}: ProductTileProps) {
  const {
    name,
    price,
    currency,
    store,
    imageUrl,
    brand,
    availability,
    inStock,
  } = product;
  const { listPrice, discountPercent, ratingAverage, ratingCount } = product;

  // Solo es oferta si el precio tachado es realmente mayor: varias tiendas
  // repiten el precio actual en el campo "antes".
  const hasDiscount = listPrice !== undefined && listPrice > price;
  const isGallery = mode === "gallery";

  return (
    /* El control de comparar vive FUERA del enlace, no dentro: un <button>
       anidado en un <a> es HTML inválido y en la práctica hace que pulsarlo
       también navegue. Por eso la tarjeta es un contenedor posicionado con el
       enlace dentro y el control encima. */
    <div className="group relative h-full">
      <Link
        href={href}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] outline-none transition-[border-color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
      >
        <div className="relative overflow-hidden bg-[var(--bg-inset)]">
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt={name}
              loading="lazy"
              /* `aspect-ratio` fijo por densidad: reservar el alto antes de que
               cargue la imagen es lo que mantiene el CLS en cero al hacer
               scroll por cientos de fichas. */
              className={`w-full ${imageHeightFor(mode, density)} object-contain p-3 transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.04]`}
            />
          ) : (
            <div
              className={`flex w-full ${imageHeightFor(mode, density)} items-center justify-center`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-8 w-8 text-[var(--text-tertiary)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5V7.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5Z M3 16.5 8.25 11l3 3 3.75-4.5L21 15"
                />
              </svg>
            </div>
          )}

          {hasDiscount && discountPercent !== undefined && (
            <span className="absolute top-2.5 left-2.5 rounded-full bg-[var(--price-win)] px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-[var(--price-win-contrast)]">
              -{Math.round(discountPercent)}%
            </span>
          )}

          {/* Abajo a la izquierda: arriba a la derecha es ahora el sitio del
            control de comparar, y dos elementos en la misma esquina se pisan
            en las densidades compactas.

            "Agotado" es un estado, y en gris se leía igual que la marca o la
            tienda: información de fondo. Teñido se ve sin buscarlo, que es lo
            que necesita quien recorre la cuadrícula para no abrir una ficha
            que no puede comprar. */}
          {inStock === false && (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-[var(--critical-soft)] px-2 py-0.5 text-[0.6875rem] font-medium text-[var(--critical)] backdrop-blur-sm">
              {availability ?? "Agotado"}
            </span>
          )}
        </div>

        <div
          className={`flex flex-1 flex-col gap-1 ${isGallery ? "p-5" : "p-3.5"}`}
        >
          {brand && (
            <span className="truncate text-[0.6875rem] tracking-[0.1em] text-[var(--text-tertiary)] uppercase">
              {brand}
            </span>
          )}

          <h3
            className={`line-clamp-2 font-medium tracking-[-0.01em] text-[var(--text)] ${
              isGallery ? "text-[1.0625rem]" : "text-[0.875rem]"
            }`}
          >
            {name}
          </h3>

          {/* El precio se ancla abajo con mt-auto: en una cuadrícula de fichas de
            alto desigual, las cifras quedan alineadas entre sí y se pueden
            comparar recorriendo una sola línea horizontal. */}
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2">
            <span
              className={`font-semibold tracking-[-0.02em] tabular-nums text-[var(--text)] ${
                isGallery ? "text-[1.375rem]" : "text-[1.0625rem]"
              }`}
            >
              {formatPrice(price, currency, locale)}
            </span>
            {hasDiscount && (
              <span className="text-[0.8125rem] tabular-nums text-[var(--text-tertiary)] line-through">
                {formatPrice(listPrice, currency, locale)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-x-2 text-[0.75rem] text-[var(--text-tertiary)]">
            <span className="truncate uppercase">{store}</span>
            {ratingAverage !== undefined &&
              ratingCount !== undefined &&
              ratingCount > 0 && (
                <>
                  <span
                    aria-hidden="true"
                    className="h-0.5 w-0.5 rounded-full bg-current"
                  />
                  <span className="flex shrink-0 items-center gap-0.5 tabular-nums">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="currentColor"
                    >
                      <path d="m12 17.3-6.16 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.48 4.73 1.64 7.03z" />
                    </svg>
                    {ratingAverage.toFixed(1)}
                  </span>
                </>
              )}
          </div>
        </div>
      </Link>

      <CompareToggle
        product={product}
        labels={compareLabels}
        className="absolute top-2.5 right-2.5 z-10 shadow-[var(--shadow-sm)]"
      />
    </div>
  );
}
