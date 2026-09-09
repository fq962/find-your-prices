"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/format";
import { CompareToggle, type CompareToggleLabels } from "./CompareToggle";

/**
 * Deja pasar sólo enlaces que se pueden navegar sin peligro.
 *
 * `product.url` lo pone el scraping con lo que publica cada tienda, y de ahí
 * va directo a un `href`. Un `javascript:` en ese campo se ejecuta en nuestro
 * dominio en cuanto alguien pulsa el nombre del producto. No es un ataque que
 * requiera imaginación: basta con que una tienda cambie su HTML.
 *
 * Se aceptan rutas internas (las arma `productPath`, empiezan por "/") y
 * http/https. Lo demás no se enlaza: el nombre se queda como texto, que es
 * exactamente lo que ya pasa cuando un producto no trae URL.
 */
function safeHref(candidate: string | undefined): string | undefined {
  if (candidate === undefined) return undefined;

  const trimmed = candidate.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("/")) return trimmed;

  try {
    const { protocol } = new URL(trimmed);
    return protocol === "http:" || protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Marca de "sin foto". La misma para un producto sin imagen y para uno cuya
 *  imagen no cargó: para quien mira son el mismo hecho. */
const ImagePlaceholder = (
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
);

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
  /**
   * Textos del control de comparar. Sin esto el control usa sus propios
   * defaults en inglés, igual que las otras etiquetas de este componente: así
   * la tarjeta se sigue montando sin proveedor de idioma.
   */
  compareLabels?: CompareToggleLabels;
}

export function ProductCard({
  product,
  locale,
  href,
  viewLargerImageLabel = "View larger image of",
  closeImageLabel = "Close",
  compareLabels,
}: ProductCardProps) {
  const { name, price, currency, store, imageUrl, description, availability } = product;
  const { url, listPrice, discountPercent } = product;
  const titleHref = safeHref(href) ?? safeHref(url);
  // Salir del sitio merece aviso; navegar dentro, no.
  const isExternal = titleHref !== undefined && titleHref === url && href === undefined;
  // Solo se considera oferta si el precio tachado es realmente mayor: varias
  // tiendas repiten el precio actual en el campo "antes".
  const hasDiscount = listPrice !== undefined && listPrice > price;

  /**
   * El porcentaje también viene de la tienda y no siempre es un descuento.
   * Un 0.4% redondea a "-0%", que es una etiqueta que no dice nada, y por
   * encima de 99 el número deja de ser creíble. Fuera de ese rango se pinta el
   * precio tachado y nada más: el ahorro se sigue viendo, sin la insignia.
   */
  const roundedDiscount =
    discountPercent !== undefined && Number.isFinite(discountPercent)
      ? Math.round(discountPercent)
      : undefined;
  const showsDiscountBadge =
    hasDiscount && roundedDiscount !== undefined && roundedDiscount >= 1 && roundedDiscount <= 99;

  const [isImageOpen, setIsImageOpen] = useState(false);

  /**
   * Las imágenes son enlaces calientes a los CDN de cinco tiendas: se caen, se
   * renombran y se retiran cuando el producto deja de venderse. Sin esto queda
   * el icono de imagen rota del navegador —distinto en cada uno y feo en
   * todos— dentro de un recuadro de 64px. Con esto cae en la misma marca de
   * "sin foto" que ya existe para los productos que nunca trajeron una.
   *
   * Se guarda CUÁL url falló, no un booleano: así, si la fila se reutiliza
   * para otro producto, la imagen nueva se intenta sola y no hereda el fallo
   * de la anterior. Un booleano necesitaría un efecto que lo reinicie.
   */
  const [failedImageUrl, setFailedImageUrl] = useState<string | undefined>(undefined);
  const showsImage = imageUrl !== undefined && failedImageUrl !== imageUrl;

  /**
   * El visor es un `<dialog>` nativo, no un div sobre un portal.
   *
   * Lo que antes había que escribir a mano —capturar Escape, bloquear el
   * scroll del fondo— lo hace el navegador, y de paso hace lo que NO estaba:
   * dejar inerte todo lo de atrás. Antes se podía seguir tabulando por la
   * lista con el visor abierto, y un lector de pantalla nunca se enteraba de
   * que se había abierto nada.
   *
   * También hace innecesario el portal: un elemento en la top layer no lo
   * afecta el `transform` del ancestro animado, que era justo el motivo por el
   * que el visor tenía que salirse del árbol.
   *
   * El foco de vuelta SÍ se devuelve a mano. El `<dialog>` lo haría solo, pero
   * sólo si al cerrarse sigue en el documento, y acá React lo desmonta en el
   * mismo commit: comprobado, el foco caía en `<body>` y quien navega con
   * teclado volvía al principio de la lista en vez de a la miniatura que
   * acababa de abrir.
   */
  const dialogRef = useRef<HTMLDialogElement>(null);
  const thumbnailRef = useRef<HTMLButtonElement>(null);
  const wasImageOpen = useRef(false);

  useEffect(() => {
    const node = dialogRef.current;

    // `showModal` no existe en algunos entornos de prueba sin DOM completo.
    if (isImageOpen && node !== null && !node.open) node.showModal?.();

    /**
     * El foco vuelve acá y no en el manejador del clic: mientras el visor
     * sigue siendo modal, el navegador no deja enfocar nada de fuera, así que
     * llamar a `focus()` junto al `setState` no hacía nada y el foco terminaba
     * en `<body>`. Este efecto corre con el visor ya desmontado.
     */
    if (!isImageOpen && wasImageOpen.current) thumbnailRef.current?.focus();
    wasImageOpen.current = isImageOpen;
  }, [isImageOpen]);

  function closeImage() {
    setIsImageOpen(false);
  }

  return (
    <div className="group relative flex items-center gap-4 px-3 py-5 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:bg-[var(--bg-subtle)] sm:gap-6 sm:px-4">
      {/* El porcentaje se ancla a la miniatura, no al precio: es la señal que
          hace que el ojo se detenga al recorrer la lista. Va en el verde de
          "precio ganador" y no en el azul de la interfaz: es un hallazgo del
          catálogo, no algo que se pueda pulsar. */}
      {showsDiscountBadge && (
        <span className="pointer-events-none absolute top-3 left-1 z-10 rounded-full bg-[var(--price-win)] px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-[var(--price-win-contrast)] shadow-[var(--shadow-sm)] sm:left-2">
          -{roundedDiscount}%
        </span>
      )}

      {showsImage ? (
        <button
          type="button"
          ref={thumbnailRef}
          onClick={() => setIsImageOpen(true)}
          aria-label={`${viewLargerImageLabel} ${name}`}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-inset)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.04] active:scale-[0.98] sm:h-20 sm:w-20"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            onError={() => setFailedImageUrl(imageUrl)}
            className="h-full w-full object-cover transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.08]"
          />
        </button>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--bg-inset)] sm:h-20 sm:w-20">
          {ImagePlaceholder}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* `break-words` porque un nombre de catálogo no siempre trae espacios:
            "ADAPTADOR-USB-C/HDMI-4K60HZ-2M-NEGRO" es una sola palabra para el
            navegador y, sin esto, estira la fila hasta desbordarla. El recorte
            por líneas no ayuda ahí: recorta el alto, no el ancho. */}
        <h3 className="line-clamp-2 text-[1.0625rem] break-words sm:truncate font-medium tracking-[-0.015em] text-[var(--text)]">
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
          <p className="line-clamp-1 text-[0.9375rem] leading-snug break-words text-[var(--text-secondary)] sm:line-clamp-2">
            {description}
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] tracking-[0.005em] text-[var(--text-tertiary)]">
          <span className="min-w-0 truncate uppercase">{store}</span>
          {availability && (
            <>
              <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
              {/* `availability` es texto libre de la tienda, no un enum: llega
                  desde "En stock" hasta "Disponible para entrega en 3 a 5 días
                  hábiles en Tegucigalpa y San Pedro Sula". A una línea, para
                  que un producto no valga el triple de alto que sus vecinos. */}
              <span className="min-w-0 truncate">{availability}</span>
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

      {/* Al final de la fila y no sobre la miniatura: en la lista el ojo baja
          por la columna de precios, y apartar algo para comparar es la decisión
          que se toma justo después de leer ese precio. */}
      <CompareToggle product={product} labels={compareLabels} className="ml-1 sm:ml-2" />

      {showsImage && isImageOpen && (
        <dialog
          ref={dialogRef}
          aria-label={name}
          /* Cubre `Escape` y el cierre nativo por igual: es el único sitio que
             devuelve el estado de React a la verdad del elemento. */
          onClose={closeImage}
          className="m-0 h-full max-h-full w-full max-w-full bg-transparent p-0 backdrop:bg-black/50"
        >
          {/* Pulsar el fondo cierra; pulsar la foto o el botón, no. Se compara
              contra el propio contenedor en vez de frenar la propagación desde
              la imagen: así cualquier cosa que se agregue después queda
              protegida sin acordarse de nada. */}
          <div
            onClick={(event) => {
              if (event.target === event.currentTarget) closeImage();
            }}
            className="flex h-full w-full items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xl"
            style={{ animation: "fyp-fade 240ms var(--ease-out-quart) both" }}
          >
            <button
              type="button"
              onClick={closeImage}
              aria-label={closeImageLabel}
              /* Blanco fijo y no un token: esto vive sobre el velo, que es
                 oscuro en los dos temas. */
              className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white outline-none backdrop-blur-md transition-[background-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-105 hover:bg-white/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={name}
              /* Si la grande falla, cerrar y caer a la marca de "sin foto":
                 dejar un visor con un hueco negro es peor que no abrirlo. */
              onError={() => {
                setFailedImageUrl(imageUrl);
                setIsImageOpen(false);
              }}
              className="max-h-[85vh] max-w-[min(90vw,720px)] rounded-3xl bg-[var(--bg-elevated)] object-contain shadow-[var(--shadow-lg)]"
              style={{ animation: "fyp-scale-in 420ms var(--ease-out-expo) both" }}
            />
          </div>
        </dialog>
      )}
    </div>
  );
}
