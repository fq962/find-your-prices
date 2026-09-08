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
    <header className="relative isolate flex flex-col items-start pt-16 pb-10 sm:pt-24 sm:pb-14">
      <div
        aria-hidden="true"
        className="aurora pointer-events-none absolute -top-24 -left-32 -z-10 h-[420px] w-[620px] max-w-[140vw] rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--accent-soft), transparent 72%)",
        }}
      />

      <h1 className="max-w-[15ch] text-[clamp(2.75rem,9vw,5.75rem)] leading-[0.94] font-semibold tracking-[-0.045em] text-balance text-[var(--text)]">
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
          className="enter -mt-1 ml-[8%] font-serif text-[clamp(1.5rem,5vw,2.75rem)] leading-[1.1] tracking-[-0.01em] text-[var(--accent)] italic sm:-mt-2 sm:ml-[14%]"
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
