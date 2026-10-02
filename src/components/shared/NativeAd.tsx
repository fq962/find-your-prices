"use client";

import { useEffect, useRef } from "react";

/**
 * Native Banner de Adsterra.
 *
 * El `invoke.js` de Adsterra busca un contenedor con un id fijo y se pinta ahí
 * dentro, así que dos instancias en la misma página se pisarían: sólo se monta
 * una por pantalla (ver dónde se usa).
 *
 * El script se inserta desde el cliente y recién cuando el hueco está por
 * entrar en pantalla: en el `<head>` frenaría el primer render de todas las
 * páginas, y un anuncio que nadie llega a ver cuenta como impresión perdida.
 * El `min-height` reserva el espacio para que al llegar el anuncio no empuje
 * el contenido (CLS).
 */

const SCRIPT_SRC =
  "https://pl31437027.profitableratecpmnetwork.com/2fa4d26219f388bd1dcbc260a10dca40/invoke.js";
const CONTAINER_ID = "container-2fa4d26219f388bd1dcbc260a10dca40";

export interface NativeAdProps {
  /** Rótulo de la etiqueta "Publicidad", en el idioma de la página. */
  label: string;
  className?: string;
}

export function NativeAd({ label, className = "" }: NativeAdProps) {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    let script: HTMLScriptElement | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        script = document.createElement("script");
        script.async = true;
        script.setAttribute("data-cfasync", "false");
        script.src = SCRIPT_SRC;
        slot.appendChild(script);
      },
      { rootMargin: "300px" },
    );
    observer.observe(slot);

    return () => {
      observer.disconnect();
      // Al navegar, el contenedor se vacía para que el próximo montaje no
      // herede el anuncio anterior ni deje el script duplicado.
      script?.remove();
      document.getElementById(CONTAINER_ID)?.replaceChildren();
    };
  }, []);

  return (
    <aside aria-label={label} className={className}>
      <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <div ref={slotRef} className="min-h-[250px]">
        <div id={CONTAINER_ID} />
      </div>
    </aside>
  );
}
