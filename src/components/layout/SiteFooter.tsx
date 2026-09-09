"use client";

import Link from "next/link";
import { SHELL } from "@/components/layout/shell";
import { siteConfig } from "@/config/site";
import { useLocale } from "@/features/i18n/LocaleContext";
import { routeFor, type SitePage } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";

/**
 * Pie de página.
 *
 * Es el sitio donde se buscan las políticas —nadie las busca en un menú—, así
 * que están todas acá y en todas las páginas. Que el enlace de retiro de
 * contenido sea fácil de encontrar es parte del trato que la propia política
 * ofrece: una tienda que no encuentra a quién escribirle no escribe, reclama.
 */

const FOOTER_PAGES: SitePage[] = ["home", "about", "terms", "privacy", "content"];

const LABELS: Record<Locale, Record<SitePage, string>> = {
  es: {
    home: "Comparador",
    about: "Acerca de",
    terms: "Términos de uso",
    privacy: "Privacidad",
    content: "Uso de contenido",
  },
  en: {
    home: "Comparator",
    about: "About",
    terms: "Terms of use",
    privacy: "Privacy",
    content: "Content use",
  },
};

const TAGLINE: Record<Locale, string> = {
  es: "Comparador de precios de Honduras. No vendemos nada.",
  en: "Price comparison for Honduras. We sell nothing.",
};

export function SiteFooter() {
  const { locale } = useLocale();

  return (
    <footer className="mt-24 border-t border-[var(--border)]">
      <div className={`${SHELL} flex flex-col gap-8 py-10 sm:flex-row sm:justify-between sm:gap-12`}>
        <div className="flex flex-col gap-1">
          <p className="text-[0.9375rem] font-medium tracking-[-0.01em] text-[var(--text)]">
            {siteConfig.name}
          </p>
          <p className="max-w-[34ch] text-[0.8125rem] leading-[1.5] text-[var(--text-tertiary)]">
            {TAGLINE[locale]}
          </p>
          <p className="mt-2 text-[0.8125rem] tabular-nums text-[var(--text-tertiary)] opacity-70">
            © {new Date().getFullYear()}
          </p>
        </div>

        <nav aria-label={LABELS[locale].about}>
          <ul className="flex flex-col gap-2.5 sm:items-end">
            {FOOTER_PAGES.map((page) => (
              <li key={page}>
                <Link
                  href={routeFor(page, locale)}
                  className="rounded-sm text-[0.8125rem] text-[var(--text-secondary)] underline-offset-[3px] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:text-[var(--text)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {LABELS[locale][page]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
