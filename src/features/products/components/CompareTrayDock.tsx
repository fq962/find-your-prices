"use client";

import { useEffect, useRef } from "react";
import { SHELL } from "@/components/layout/shell";
import { MAX_COMPARE_ITEMS } from "@/features/products/compareTray";
import type { Product } from "@/types";

/**
 * Barra fija con lo que hay apartado para comparar.
 *
 * Existe porque la selección se arma mientras se navega: se aparta algo, se
 * sigue bajando, se aparta otra cosa. Sin una barra siempre visible habría que
 * recordar qué se lleva elegido y buscar dónde se abre la comparación.
 *
 * Se ancla abajo y no arriba: arriba ya está la barra de búsqueda pegada, y en
 * teléfono el borde inferior es el que queda al alcance del pulgar. Los huecos
 * vacíos se dibujan a propósito: muestran cuánto cabe todavía.
 *
 * Sobre el área segura del teléfono: el relleno de abajo está puesto, pero hoy
 * vale cero. `env(safe-area-inset-*)` sólo devuelve algo distinto de cero
 * cuando el documento declara `viewport-fit=cover`, y este no lo hace. Se deja
 * escrito porque el día que se active, esta barra ya está lista; mientras
 * tanto es el sistema el que mantiene la página por encima de la barra de
 * gestos. No se activa desde acá: `viewport-fit=cover` afecta a todo el sitio
 * y hay que revisar antes qué pasa con la navegación y el hero en horizontal
 * sobre un teléfono con muesca.
 */

export interface CompareTrayDockProps {
  items: Product[];
  labels: {
    title: string;
    open: string;
    clear: string;
    remove: string;
    hint: string;
  };
  onOpen: () => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
}

export function CompareTrayDock({
  items,
  labels,
  onOpen,
  onRemove,
  onClear,
}: CompareTrayDockProps) {
  const isVisible = items.length > 0;
  const dockRef = useRef<HTMLDivElement>(null);

  /**
   * Publica el alto de la barra en una custom property.
   *
   * Es la forma más barata de que otros elementos fijos —hoy el botón de volver
   * arriba— y el espacio de reserva al final de la lista se aparten sin que
   * haya que conectarlos por props a través de media página.
   *
   * Se MIDE, no se escribe a mano. Antes decía 5.25rem fijo y la barra no mide
   * lo mismo en teléfono que en escritorio (las miniaturas crecen de 48 a
   * 56px), ni con el área segura activada, ni si una etiqueta traducida parte
   * el botón en dos líneas. Un número copiado a mano acierta en un tamaño de
   * pantalla y miente en el resto.
   */
  useEffect(() => {
    const node = dockRef.current;
    if (node === null) return;

    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty("--fyp-dock", `${node.offsetHeight}px`);
    };

    publish();

    // Sin ResizeObserver queda la medida de entrada, que es la de siempre
    // salvo que gire el teléfono. Es un peor resultado, no uno roto.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(node);

    return () => {
      observer?.disconnect();
      root.style.removeProperty("--fyp-dock");
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const emptySlots = Math.max(MAX_COMPARE_ITEMS - items.length, 0);

  return (
    <div
      ref={dockRef}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--glass)] backdrop-blur-xl"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        animation: "fyp-rise 380ms var(--ease-out-expo) both",
      }}
    >
      <div className={`${SHELL} flex items-center gap-3 py-3 sm:gap-4`}>
        {/* Con cuatro artículos apartados las miniaturas no caben en un
            teléfono (222px de contenido en 180px de sitio), así que la tira se
            desliza. `snap` para que un deslizamiento deje una miniatura
            encuadrada y no a medias, y `overscroll-contain` para que al llegar
            al final el gesto no siga y arrastre la página entera detrás —que
            es justo lo que pasaba, y en una barra fija al alcance del pulgar
            ocurre todo el tiempo.

            `py-2` no es aire: un contenedor que desplaza en horizontal también
            recorta en vertical, y la cruz de quitar sobresale 6px por arriba
            de su miniatura. Sin este relleno se le cortaba la tapa —y con ella
            se recortaba también su zona de toque—. */}
        <div className="-my-2 flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-2 overflow-x-auto overscroll-x-contain py-2 sm:gap-3">
          {items.map((product) => (
            <div key={product.id} className="relative shrink-0 snap-start">
              <div className="h-12 w-12 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] sm:h-14 sm:w-14">
                {product.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-[0.5625rem] leading-tight text-[var(--text-tertiary)]">
                    {product.name.slice(0, 18)}
                  </span>
                )}
              </div>

              {/* Medía 20px, por debajo del mínimo táctil de 24px, y esto
                  BORRA algo: fallar el toque cuesta rehacer una selección.
                  Crece la marca en vez de estirarla con un `before`, porque
                  acá el pseudo-elemento no serviría: el contenedor que
                  desplaza recorta lo que se sale, así que la mitad de esa zona
                  invisible quedaba fuera. 24px de verdad sí entran. Las cruces
                  vecinas siguen a 56px de distancia. */}
              <button
                type="button"
                onClick={() => onRemove(product.id)}
                aria-label={`${labels.remove}: ${product.name}`}
                title={labels.remove}
                className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] shadow-[var(--shadow-sm)] outline-none transition-[color,transform] duration-[var(--dur-fast)] ease-[var(--ease-spring)] hover:text-[var(--text)] active:scale-90 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                >
                  <path d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Huecos libres: dicen cuánto más cabe sin tener que contar. Se
              esconden en pantallas angostas, donde el ancho vale más. */}
          {Array.from({ length: emptySlots }).map((_, index) => (
            <div
              key={`slot-${index}`}
              aria-hidden="true"
              className="hidden h-14 w-14 shrink-0 rounded-xl border border-dashed border-[var(--border-strong)] opacity-50 sm:block"
            />
          ))}

          <p className="ml-1 hidden min-w-0 text-[0.8125rem] leading-tight text-[var(--text-secondary)] lg:block">
            <span className="font-medium text-[var(--text)]">{labels.title}</span>
            <br />
            <span className="text-[var(--text-tertiary)]">{labels.hint}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Con puntero grueso crece hasta el mínimo táctil sin engordar el
              texto: en escritorio es un enlace discreto al lado de la acción
              principal, y en teléfono comparte fila con ella a menos de un
              centímetro. Vaciar la bandeja por error es caro. */}
          <button
            type="button"
            onClick={onClear}
            className="flex items-center rounded-full px-2 py-1.5 text-[0.8125rem] text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3"
          >
            {labels.clear}
          </button>

          <button
            type="button"
            onClick={onOpen}
            className="flex h-11 items-center gap-2 rounded-full bg-[var(--text)] px-5 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            {labels.open}
            <span className="rounded-full bg-[var(--text-inverted)]/15 px-1.5 text-[0.75rem] tabular-nums">
              {items.length}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
