"use client";

import { useEffect, useState } from "react";

/**
 * Vuelta al principio del documento.
 *
 * Con el catálogo cargando solo mientras se baja, volver al buscador eran
 * treinta gestos en un teléfono. Aparece pasada una pantalla y media —antes
 * sería ruido sobre contenido que todavía se ve entero— y se queda quieto en la
 * esquina hasta que hace falta.
 *
 * No es sólo desplazar: también devuelve el foco al primer enlace del
 * documento. Para quien navega con teclado, una página que se desplaza sola
 * dejando el foco doscientas fichas abajo es peor que no haberla desplazado.
 */

export interface BackToTopProps {
  label: string;
}

/** Pantalla y media: pasado eso, el principio ya no está a un gesto. */
const REVEAL_RATIO = 1.5;

export function BackToTop({ label }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Sólo se llama a setState cuando el umbral se cruza de verdad, no en cada
    // píxel: el listener corre en cada scroll y un render por píxel sería un
    // impuesto sobre el gesto que más se usa en el sitio.
    const onScroll = () => {
      setIsVisible((current) => {
        const next = window.scrollY > window.innerHeight * REVEAL_RATIO;
        return next === current ? current : next;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!isVisible) return null;

  function backToTop() {
    // `scroll-behavior: smooth` vive en <html> y la regla de reduced-motion ya
    // lo desactiva: acá no hay que decidir nada sobre la animación.
    window.scrollTo({ top: 0 });

    // `preventScroll` para que enfocar no pelee con el desplazamiento que acaba
    // de empezar.
    document.querySelector<HTMLElement>("nav a[href]")?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={backToTop}
      aria-label={label}
      title={label}
      /* El desplazamiento se mide desde el borde inferior, pero abajo puede
         haber dos cosas: el área de gestos del teléfono y la barra de la
         bandeja de comparación, que publica su alto medido en `--fyp-dock`.
         `max` y no una suma: ese alto medido YA incluye el área segura, así
         que sumarlas dejaría el botón flotando el doble de arriba cuando hay
         algo apartado. Sin barra queda el área segura sola. */
      style={{
        bottom: "calc(1.25rem + max(var(--fyp-dock, 0px), env(safe-area-inset-bottom)))",
        animation: "fyp-scale-in 320ms var(--ease-out-expo) both",
      }}
      className="fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--glass)] text-[var(--text-secondary)] shadow-[var(--shadow-md)] backdrop-blur-xl outline-none transition-[color,border-color,transform] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:text-[var(--text)] active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] sm:right-6"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5m0 0-6 6m6-6 6 6" />
      </svg>
    </button>
  );
}
