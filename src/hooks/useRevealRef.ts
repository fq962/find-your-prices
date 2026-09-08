"use client";

import { useCallback } from "react";

export interface UseRevealRefOptions {
  /** Fracción del elemento visible que dispara el reveal. */
  threshold?: number;
  /** Margen del viewport; negativo abajo = revela justo antes de entrar. */
  rootMargin?: string;
}

/**
 * Devuelve un ref callback que marca `data-revealed="true"` en el nodo la
 * primera vez que entra en viewport. La transición vive en CSS (clase
 * `.reveal`): acá sólo se conmuta un atributo, sin estado de React y por lo
 * tanto sin re-renders.
 *
 * Si no hay IntersectionObserver, o el usuario pidió menos movimiento, el
 * nodo se marca revelado de inmediato: nunca se esconde contenido detrás de
 * una animación que puede no ejecutarse.
 */
export function useRevealRef({
  threshold = 0.2,
  rootMargin = "0px 0px -8% 0px",
}: UseRevealRefOptions = {}) {
  return useCallback(
    (node: HTMLElement | null) => {
      if (node === null) return;

      const reveal = () => {
        node.dataset.revealed = "true";
      };

      if (
        typeof IntersectionObserver === "undefined" ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        reveal();
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              reveal();
              observer.disconnect();
            }
          }
        },
        { threshold, rootMargin },
      );

      observer.observe(node);

      return () => observer.disconnect();
    },
    [threshold, rootMargin],
  );
}
