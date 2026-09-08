"use client";

import { useEffect } from "react";

export const SCROLL_PROGRESS_PROPERTY = "--scroll-progress";

/**
 * Avance de lectura, acotado a 0 → 1. Separado del hook para poder probarlo
 * sin DOM ni frames: es la única parte con aritmética que puede equivocarse.
 *
 * Un documento que no desborda no tiene avance posible: devuelve 0 en vez de
 * dividir por cero.
 */
export function computeScrollProgress(
  scrollY: number,
  documentHeight: number,
  viewportHeight: number,
): number {
  const max = documentHeight - viewportHeight;

  if (!(max > 0) || !Number.isFinite(scrollY)) {
    return 0;
  }

  return Math.min(1, Math.max(0, scrollY / max));
}

/**
 * Publica el avance de lectura del documento (0 → 1) en la custom property
 * `--scroll-progress` de `<html>`. Quien la quiera usar lo hace desde CSS:
 * este hook no renderiza nada ni provoca renders de React.
 *
 * Se hizo así en vez de con `animation-timeline: scroll()` porque las
 * animaciones ligadas al scroll de CSS no existen todavía en Firefox ni en
 * Safari anteriores a la 26: ahí no habría ningún avance. Un listener pasivo
 * con rAF funciona en todos lados y se puede verificar con tests.
 */
export function useScrollProgress(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      frame = 0;
      const progress = computeScrollProgress(
        window.scrollY,
        root.scrollHeight,
        window.innerHeight,
      );
      root.style.setProperty(SCROLL_PROGRESS_PROPERTY, progress.toFixed(4));
    };

    // Un solo cálculo por frame por mucho que el scroll dispare eventos.
    const schedule = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.style.removeProperty(SCROLL_PROGRESS_PROPERTY);
    };
  }, []);
}
