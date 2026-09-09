"use client";

import Link from "next/link";
import { useLocale } from "./LocaleContext";
import { LOCALES, localePath, type Locale } from "./translate";

export interface LocaleSwitcherProps {
  /**
   * A dónde lleva cada idioma. Por defecto, a la portada de ese idioma; una
   * página con traducción propia pasa su propio par de rutas para que cambiar
   * de idioma no te saque de donde estabas.
   */
  paths?: Record<Locale, string>;
}

/**
 * Control segmentado de idioma. Cada opción es un enlace real a su ruta
 * canónica ("/" en español, "/en" en inglés): el idioma es parte de la URL,
 * así que se comparte y se indexa, no vive sólo en memoria.
 *
 * Visualmente una única pastilla se desliza entre las dos opciones — el
 * movimiento es lo que comunica el cambio de estado.
 */
export function LocaleSwitcher({ paths }: LocaleSwitcherProps = {}) {
  const { locale } = useLocale();
  const activeIndex = LOCALES.indexOf(locale);

  return (
    <div className="relative inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]/70 p-1 backdrop-blur-md">
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-[var(--text)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)]"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {LOCALES.map((option) => {
        const isActive = option === locale;

        return (
          <Link
            key={option}
            href={paths?.[option] ?? localePath(option)}
            hrefLang={option}
            aria-current={isActive ? "page" : undefined}
            className="relative z-10 w-11 rounded-full py-1.5 text-center text-[0.8125rem] font-medium tracking-[0.02em] text-[var(--text-secondary)] transition-colors duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:text-[var(--text)] aria-[current=page]:text-[var(--text-inverted)]"
          >
            {option.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
