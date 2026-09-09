"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SHELL } from "@/components/layout/shell";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { LocaleSwitcher } from "@/features/i18n/LocaleSwitcher";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

const HOME_LABEL: Record<string, string> = {
  en: "Find Your Prices — home",
  es: "Find Your Prices — inicio",
};

const THEME_LABEL: Record<string, string> = {
  en: "Switch color theme",
  es: "Cambiar el tema de color",
};

/**
 * Barra fija translúcida. La hairline inferior sólo aparece cuando la página
 * ya se desplazó: en reposo la navegación se funde con el fondo.
 */
export interface SiteNavProps {
  /** La página actual en cada idioma; se lo pasa al selector de idioma. */
  localePaths?: Record<Locale, string>;
}

export function SiteNav({ localePaths }: SiteNavProps = {}) {
  const { locale } = useLocale();
  const [isScrolled, setIsScrolled] = useState(false);

  useScrollProgress();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`enter-fade sticky top-0 z-40 h-14 bg-[var(--glass)] backdrop-blur-xl transition-[border-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-out-quart)] ${
        isScrolled
          ? "border-b border-[var(--border)] shadow-[var(--shadow-sm)]"
          : "border-b border-transparent"
      }`}
    >
      <div className={`${SHELL} flex h-full items-center justify-between`}>
        {/* El logo lleva al catálogo. Desde que existen páginas que no son la
            portada, era la única salida de vuelta y no estaba. */}
        <Link
          href={routeFor("home", locale)}
          aria-label={HOME_LABEL[locale] ?? HOME_LABEL.en}
          className="-m-2 rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[22px] w-[22px] text-[var(--text)] transition-transform duration-[var(--dur-slow)] ease-[var(--ease-spring)] hover:rotate-[-8deg]"
          >
            <path d="M12.6 3H5.4A2.4 2.4 0 0 0 3 5.4v7.2c0 .64.25 1.25.7 1.7l6.7 6.7a2.4 2.4 0 0 0 3.4 0l6.2-6.2a2.4 2.4 0 0 0 0-3.4l-6.7-6.7a2.4 2.4 0 0 0-1.7-.7Z" />
            <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        </Link>

        <div className="flex items-center gap-2.5">
          <LocaleSwitcher paths={localePaths} />
          <ThemeToggle label={THEME_LABEL[locale] ?? THEME_LABEL.en} />
        </div>
      </div>

      {/* Progreso de lectura: se dibuja contra el scroll del documento, no
          contra un temporizador, así que no miente sobre cuánto falta. Donde
          no hay scroll-driven animations no se pinta en absoluto. */}
      <span
        aria-hidden="true"
        className="scroll-progress absolute inset-x-0 bottom-0 h-px bg-[var(--accent)]"
      />
    </nav>
  );
}
