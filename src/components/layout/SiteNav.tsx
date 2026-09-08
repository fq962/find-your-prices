"use client";

import { useEffect, useState } from "react";
import { LocaleSwitcher } from "@/features/i18n/LocaleSwitcher";
import { useLocale } from "@/features/i18n/LocaleContext";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

const THEME_LABEL: Record<string, string> = {
  en: "Switch color theme",
  es: "Cambiar el tema de color",
};

/**
 * Barra fija translúcida. La hairline inferior sólo aparece cuando la página
 * ya se desplazó: en reposo la navegación se funde con el fondo.
 */
export function SiteNav() {
  const { locale } = useLocale();
  const [isScrolled, setIsScrolled] = useState(false);

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
      <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-between px-4 sm:px-6">
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

        <div className="flex items-center gap-2.5">
          <LocaleSwitcher />
          <ThemeToggle label={THEME_LABEL[locale] ?? THEME_LABEL.en} />
        </div>
      </div>
    </nav>
  );
}
