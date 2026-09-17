"use client";

import Link from "next/link";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";
import type { CompareToggleLabels } from "./CompareToggle";
import { FavoriteToggle, type FavoriteToggleLabels } from "./FavoriteToggle";

export interface ProductTileProps {
  product: Product;
  href: string;
  locale?: string;
  /** Se acepta pero no se usa mientras el control de comparar esté apagado. */
  compareLabels?: CompareToggleLabels;
  favoriteLabels?: FavoriteToggleLabels;
}

/**
 * La ficha de producto: la única forma en que el catálogo muestra un artículo.
 *
 * Antes había cuatro vistas (lista, cuadrícula, galería, comparar por tienda)
 * y tres densidades, y cada combinación era una ficha distinta que había que
 * mantener. Se quedó esta sola, que es la de cualquier tienda en el teléfono:
 * foto grande arriba, marca en pequeño, nombre en dos líneas y el precio como
 * lo único en negrita. Sin caja ni borde —la foto sobre su placa clara ya
 * delimita la ficha, y un borde alrededor de cada una convertía la retícula
 * en una pared de rectángulos.
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
  locale,
  favoriteLabels,
}: ProductTileProps) {
  const { name, price, currency, store, imageUrl, brand, availability, inStock } = product;
  const { listPrice, discountPercent, ratingAverage, ratingCount } = product;

  // Solo es oferta si el precio tachado es realmente mayor: varias tiendas
  // repiten el precio actual en el campo "antes".
  const hasDiscount = listPrice !== undefined && listPrice > price;

  return (
    /* El control de comparar vive FUERA del enlace, no dentro: un <button>
       anidado en un <a> es HTML inválido y en la práctica hace que pulsarlo
       también navegue. Por eso la tarjeta es un contenedor posicionado con el
       enlace dentro y el control encima. */
    <div className="group relative h-full">
      <Link
        href={href}
        data-product-id={product.id}
        className="flex h-full flex-col gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg)]"
      >
        {/* Placa de la foto: cuadrada, con `aspect-square` y no un alto fijo,
            para que la retícula reserve el espacio antes de que cargue la
            imagen y el CLS se quede en cero al desplazarse por cientos de
            fichas.

            Blanca siempre, en claro y en oscuro: casi todas las fotos de
            tienda vienen con fondo blanco, y sobre una placa gris ese
            fondo se ve como un cuadro pegado dentro de otro. */}
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white transition-[box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] group-hover:shadow-[var(--shadow-md)]">
          {imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt={name}
              loading="lazy"
              className="h-full w-full object-contain p-4 transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                // Color fijo: la placa es blanca en los dos temas, y el gris
                // del tema oscuro no se vería sobre ella.
                className="h-8 w-8 text-neutral-400"
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

          {/* Abajo a la izquierda: arriba a la derecha es el sitio de los
              controles, y dos elementos en la misma esquina se pisan.

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

        {/* Orden del texto, de arriba abajo: tienda, nombre, marca, precio.
            La tienda va primero y en gris porque es lo que distingue dos
            fichas del mismo artículo —el nombre se repite, la tienda no—.
            La marca va bajo el nombre, también en gris: es dato de apoyo. */}
        <div className="flex flex-1 flex-col gap-0.5 px-0.5">
          <span className="truncate text-[0.75rem] text-[var(--text-tertiary)]">{store}</span>

          <h3 className="line-clamp-2 text-[0.875rem] leading-[1.35] font-medium tracking-[-0.01em] text-[var(--text)] sm:text-[0.9375rem]">
            {name}
          </h3>

          {(brand || (ratingAverage !== undefined && ratingCount !== undefined && ratingCount > 0)) && (
            <div className="flex items-center gap-x-2 text-[0.75rem] text-[var(--text-tertiary)]">
              {brand && <span className="truncate">{brand}</span>}
              {ratingAverage !== undefined && ratingCount !== undefined && ratingCount > 0 && (
                <>
                  {brand && <span aria-hidden="true" className="h-0.5 w-0.5 rounded-full bg-current" />}
                  <span className="flex shrink-0 items-center gap-0.5 tabular-nums">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                      <path d="m12 17.3-6.16 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.48 4.73 1.64 7.03z" />
                    </svg>
                    {ratingAverage.toFixed(1)}
                  </span>
                </>
              )}
            </div>
          )}

          {/* El precio se ancla abajo con mt-auto: en una cuadrícula de fichas
              de alto desigual, las cifras quedan alineadas entre sí y se pueden
              comparar recorriendo una sola línea horizontal. */}
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2">
            <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] tabular-nums text-[var(--text)]">
              {formatPrice(price, currency, locale)}
            </span>
            {hasDiscount && (
              <span className="text-[0.8125rem] tabular-nums text-[var(--text-tertiary)] line-through">
                {formatPrice(listPrice, currency, locale)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Sólo el corazón en la esquina. El control de comparar queda apagado
          por ahora —la bandeja sigue existiendo, pero no se alimenta desde la
          ficha—; se reactiva descomentando el bloque. */}
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
        <FavoriteToggle product={product} labels={favoriteLabels} />
        {/* <CompareToggle product={product} labels={compareLabels} /> */}
      </div>
    </div>
  );
}
