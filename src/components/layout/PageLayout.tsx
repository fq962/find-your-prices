import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteNav } from "@/components/layout/SiteNav";
import { LocaleProvider } from "@/features/i18n/LocaleContext";
import type { Locale } from "@/features/i18n/translate";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

/**
 * Estructura común de una página completa: tema, idioma, navegación y pie.
 *
 * Existe porque a la cuarta página este bloque ya estaba copiado cuatro veces,
 * y cada copia era una oportunidad de que una página se quedara sin
 * `ThemeProvider` y parpadeara en blanco al cargar.
 */
export interface PageLayoutProps {
  locale: Locale;
  /**
   * La misma página en el otro idioma. Se lo pasa al selector de idioma para
   * que cambiar de idioma en "Privacidad" lleve a "Privacy" y no a la portada,
   * que es lo que hacía antes por no tener esta información.
   */
  localePaths?: Record<Locale, string>;
  children: ReactNode;
}

export function PageLayout({ locale, localePaths, children }: PageLayoutProps) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={locale}>
        <div className="flex flex-1 flex-col">
          <SiteNav localePaths={localePaths} />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}
