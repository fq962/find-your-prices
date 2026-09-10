"use client";

import type { CSSProperties } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";

/**
 * Momento firma de la página: el nombre del producto ocupa el ancho completo
 * en la sans geométrica, y debajo — sólo donde el idioma lo pide — su lectura
 * nativa en serif itálica, desplazada a la derecha y montada sobre la línea
 * de arriba. La tensión sans/serif y el quiebre de la retícula son el punto.
 */
export function Hero() {
  const { t } = useLocale();
  const words = t("siteTitle").split(" ");
  const nativeTitle = t("heroNativeTitle");

  return (
    <header className="relative isolate flex flex-col items-start overflow-hidden pt-16 pb-10 sm:pt-24 sm:pb-14">
      {/* Dos capas porque son dos movimientos distintos y cada clase declara
          su propia `animation`: la de afuera se desplaza con el scroll, la de
          adentro deriva sola. Ambas decorativas — el parallax nunca toca el
          texto.

          `overflow-hidden` en el header: el blob mide 760px y en un teléfono
          angosto (~375px) sobra por la derecha aunque haya `max-w-[150vw]`
          (150vw en 375px siguen siendo 562px). Sin recorte ese sobrante se
          convertía en scroll horizontal de toda la página. El parallax solo
          traslada en vertical, así que recortar en el borde del header no le
          quita nada al efecto. */}
      <div
        aria-hidden="true"
        className="parallax-slow pointer-events-none absolute -top-32 -left-40 -z-10 h-[520px] w-[760px] max-w-[150vw]"
      >
        <div
          className="aurora h-full w-full rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, var(--accent-soft), transparent 72%)",
          }}
        />
      </div>

      <h1 className="max-w-[13ch] text-[clamp(3rem,10.5vw,8.5rem)] leading-[0.9] font-semibold tracking-[-0.05em] text-balance text-[var(--text)]">
        {words.map((word, index) => (
          <span key={`${word}-${index}`}>
            <span
              className="enter inline-block"
              style={{ "--enter-delay": `${140 + index * 90}ms` } as CSSProperties}
            >
              {word}
            </span>{" "}
          </span>
        ))}
      </h1>

      {nativeTitle && (
        <p
          className="enter -mt-1 ml-[8%] font-serif text-[clamp(1.625rem,6vw,4rem)] leading-[1.05] tracking-[-0.015em] text-[var(--accent)] italic sm:-mt-3 sm:ml-[16%]"
          style={{ "--enter-delay": "430ms" } as CSSProperties}
        >
          {nativeTitle}
        </p>
      )}

      <p
        className="enter mt-6 max-w-[42ch] text-[clamp(1.0625rem,2.2vw,1.375rem)] leading-[1.5] tracking-[-0.01em] text-[var(--text-secondary)]"
        style={{ "--enter-delay": "560ms" } as CSSProperties}
      >
        {t("heroTagline")}
      </p>
    </header>
  );
}
