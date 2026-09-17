"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LocaleSwitcher } from "@/features/i18n/LocaleSwitcher";
import { useLocale } from "@/features/i18n/LocaleContext";
import type { Locale } from "@/features/i18n/translate";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

const LABELS: Record<Locale, { menu: string; language: string; theme: string }> = {
  es: { menu: "Preferencias", language: "Idioma", theme: "Tema" },
  en: { menu: "Preferences", language: "Language", theme: "Theme" },
};

export interface PreferencesMenuProps {
  /** La página actual en cada idioma; se lo pasa al selector de idioma. */
  localePaths?: Record<Locale, string>;
}

/**
 * Idioma y tema, condensados en un solo botón de la barra.
 *
 * Eran dos controles sueltos que se llevaban un tercio de la barra en
 * escritorio y no cabían en teléfono, donde bajaban al pie. Son ajustes que
 * se tocan una vez y no navegación: no merecen sitio permanente. Un botón
 * abre un panel flotante con los dos; se cierra con Escape, al hacer clic
 * fuera o al elegir un idioma (que navega).
 */
export function PreferencesMenu({ localePaths }: PreferencesMenuProps = {}) {
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
        aria-label={labels.menu}
        title={labels.menu}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        className={`-m-1 flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          open ? "text-[var(--text)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {/* Tres deslizadores: "ajustes" sin ser el engranaje de "configuración
            de la cuenta", que acá no existe. */}
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
          <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={labels.menu}
          className="absolute top-full right-0 z-50 mt-2 w-[15.5rem] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-md)]"
          style={{ animation: "fyp-fade 180ms var(--ease-out-quart) both" }}
        >
          <div className="flex items-center justify-between gap-4 px-1 py-1.5">
            <span className="text-[0.8125rem] font-medium tracking-[-0.005em] text-[var(--text-secondary)]">
              {labels.language}
            </span>
            <LocaleSwitcher paths={localePaths} />
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-[var(--border)] px-1 pt-2.5 pb-1">
            <span className="text-[0.8125rem] font-medium tracking-[-0.005em] text-[var(--text-secondary)]">
              {labels.theme}
            </span>
            <ThemeToggle label={labels.theme} />
          </div>
        </div>
      )}
    </div>
  );
}
