"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SHELL } from "@/components/layout/shell";
import { useScrollProgress } from "@/hooks/useScrollProgress";
import { LocaleSwitcher } from "@/features/i18n/LocaleSwitcher";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { SiteSearch } from "@/features/products/components/SiteSearch";
import { useFavorites } from "@/features/products/useFavorites";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

const HOME_LABEL: Record<string, string> = {
  en: "Find Your Prices — home",
  es: "Find Your Prices — inicio",
};

const THEME_LABEL: Record<string, string> = {
  en: "Switch color theme",
  es: "Cambiar el tema de color",
};

const CATEGORIES_LABEL: Record<string, string> = {
  en: "Categories",
  es: "Categorías",
};

const FAVORITES_LABEL: Record<string, string> = {
  en: "Favorites",
  es: "Favoritos",
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
  const { count: favoritesCount } = useFavorites();

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
      <div className={`${SHELL} flex h-full items-center gap-3 sm:gap-4`}>
        {/* El logo lleva al catálogo. Desde que existen páginas que no son la
            portada, era la única salida de vuelta y no estaba. */}
        <Link
          href={routeFor("home", locale)}
          aria-label={HOME_LABEL[locale] ?? HOME_LABEL.en}
          className="-m-2 shrink-0 rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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

        {/* El buscador va en la barra y no en la página: es la acción
            principal del sitio y tiene que estar a mano en todas las páginas
            y a cualquier altura del scroll. En teléfono ocupa todo lo que
            queda entre el logo y el icono de categorías; en escritorio se
            acota para que no se convierta en una línea de un metro. */}
        <div className="min-w-0 flex-1 lg:mx-auto lg:max-w-[34rem]">
          <SiteSearch />
        </div>

        {/* El árbol de categorías es la segunda puerta del sitio después del
            buscador, y un rastreador tiene que encontrarla desde cualquier
            página. En teléfono es sólo el icono —el texto no cabe junto al
            buscador—; el nombre sigue ahí para el lector de pantalla. */}
        <Link
          href={routeFor("categories", locale)}
          aria-label={CATEGORIES_LABEL[locale] ?? CATEGORIES_LABEL.en}
          title={CATEGORIES_LABEL[locale] ?? CATEGORIES_LABEL.en}
          className="-m-1 flex h-9 shrink-0 items-center gap-1.5 rounded-full px-1 text-[0.8125rem] font-medium tracking-[-0.01em] text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:px-2.5"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[20px] w-[20px]"
          >
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
          </svg>
          <span className="hidden sm:inline">{CATEGORIES_LABEL[locale] ?? CATEGORIES_LABEL.en}</span>
        </Link>

        {/* En teléfono la barra son tres cosas: logo, buscador y categorías.
            Favoritos, idioma y tema bajan al pie de página, donde caben; a
            partir de `sm` vuelven acá. */}
        <div className="hidden items-center gap-2.5 sm:flex">
          {/* El corazón de la barra es la puerta a "Mis favoritos" y a la vez
              el contador: se ve cuántos hay sin entrar. En el servidor y hasta
              hidratar el contador es 0 y no se pinta, así el HTML coincide. */}
          <Link
            href={routeFor("favorites", locale)}
            aria-label={
              favoritesCount > 0
                ? `${FAVORITES_LABEL[locale] ?? FAVORITES_LABEL.en} (${favoritesCount})`
                : (FAVORITES_LABEL[locale] ?? FAVORITES_LABEL.en)
            }
            title={FAVORITES_LABEL[locale] ?? FAVORITES_LABEL.en}
            className="relative -m-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--favorite)] focus-visible:ring-2 focus-visible:ring-[var(--favorite)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[20px] w-[20px]"
              fill={favoritesCount > 0 ? "var(--favorite)" : "none"}
              stroke={favoritesCount > 0 ? "var(--favorite)" : "currentColor"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4.5 6.9 4.5c1.9 0 3.5 1 4.4 2.4a5.1 5.1 0 0 1 4.4-2.4c3.3 0 5.6 3.1 4.3 6.6C19.5 15.9 12 20.5 12 20.5Z" />
            </svg>
            {favoritesCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--favorite)] px-1 text-[0.625rem] font-semibold tabular-nums text-[var(--favorite-contrast)] shadow-[var(--shadow-sm)]"
              >
                {favoritesCount > 99 ? "99+" : favoritesCount}
              </span>
            )}
          </Link>
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
