"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";

const LABELS: Record<Locale, { menu: string; close: string; categories: string; stores: string }> = {
  es: { menu: "Menú", close: "Cerrar menú", categories: "Categorías", stores: "Tiendas" },
  en: { menu: "Menu", close: "Close menu", categories: "Categories", stores: "Stores" },
};

/**
 * Menú hamburguesa de teléfono y tableta: categorías y tiendas.
 *
 * En escritorio esas dos puertas van sueltas en la barra; en pantallas chicas
 * competían con el buscador y con favoritos por los mismos 360px, y el
 * buscador —la acción principal— quedaba a media caja. Acá se pliegan detrás
 * de un botón, y la barra se queda con lo que se usa a cada rato: buscar,
 * favoritos y preferencias. Sólo se monta por debajo de `lg` (ver SiteNav).
 *
 * Mismo comportamiento que `PreferencesMenu`: panel flotante, se cierra con
 * Escape, al tocar fuera o al elegir un destino.
 */
export function MobileMenu() {
  const { locale } = useLocale();
  const labels = LABELS[locale] ?? LABELS.en;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? labels.close : labels.menu}
        title={labels.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="mobile-menu-button"
        className={`-m-1 flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          open ? "text-[var(--text)]" : "text-[var(--text-secondary)]"
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[20px] w-[20px]"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="menu"
          aria-label={labels.menu}
          className="absolute top-full right-0 z-50 mt-2 w-[13.5rem] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-md)]"
          style={{ animation: "fyp-fade 180ms var(--ease-out-quart) both" }}
        >
          <MenuLink href={routeFor("categories", locale)} label={labels.categories} onNavigate={() => setOpen(false)}>
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
          </MenuLink>
          <MenuLink href={routeFor("stores", locale)} label={labels.stores} onNavigate={() => setOpen(false)}>
            <path d="M3.5 9.5 5 4.5h14l1.5 5" />
            <path d="M3.5 9.5a2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0" />
            <path d="M5 12.5v7h14v-7" />
            <path d="M10 19.5v-4.5h4v4.5" />
          </MenuLink>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  label,
  onNavigate,
  children,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[20px] w-[20px] text-[var(--text-secondary)]"
      >
        {children}
      </svg>
      {label}
    </Link>
  );
}
